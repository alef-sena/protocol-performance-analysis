import fs from 'fs';
import path from 'path';
import mqtt from 'mqtt';

const BROKER_URL = process.env.TARGET || 'mqtt://mqtt-broker:1883';
const PAYLOAD_SIZE = parseInt(process.env.PAYLOAD_KB || '1') * 1024;
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '10000');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000');
const OUTPUT_PATH = process.env.OUTPUT_PATH;
const REQUEST_TOPIC = 'benchmark/request';
const RESPONSE_TOPIC = 'benchmark/response';

const PAYLOAD = 'x'.repeat(PAYLOAD_SIZE);

type RequestResult = {
	request: number;
	startTime: number;
	endTime: number;
	latencyMs: number;
	statusCode: number;
};

type PendingRequest = {
	startTime: number;
	startHr: bigint;
	timeout: NodeJS.Timeout;
	resolve: () => void;
};

const results: RequestResult[] = [];
const pendingRequests = new Map<number, PendingRequest>();

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;

	return sorted[Math.max(0, index)];
}

function minMax(values: number[]): { min: number; max: number } {
	let min = Infinity;
	let max = -Infinity;

	for (const value of values) {
		if (value < min) min = value;
		if (value > max) max = value;
	}

	return { min, max };
}

const client = mqtt.connect(
	BROKER_URL,
	{
		reconnectPeriod: 0,
		connectTimeout: 5000
	}
);

function waitForConnection(): Promise<void> {
	return new Promise((resolve, reject) => {
		client.on('connect', () => {

			client.subscribe(RESPONSE_TOPIC, (err) => {
				if (err) {
					reject(err);
					return;
				}

				resolve();
			});
		});

		client.on('error', reject);
	});
}

client.on('message', (topic, message) => {
	if (topic !== RESPONSE_TOPIC) {
		return;
	}

	let data: { id: number };

	try {
		data = JSON.parse(message.toString());
	} catch {
		return;
	}

	const pending = pendingRequests.get(data.id);

	if (!pending) {
		return;
	}

	clearTimeout(pending.timeout);

	const endTime = Date.now();
	const endHr = process.hrtime.bigint();

	results.push({
		request: data.id,
		startTime: pending.startTime,
		endTime,
		latencyMs: Number(endHr - pending.startHr) / 1_000_000,
		statusCode: 200
	});

	pendingRequests.delete(data.id);
	pending.resolve();
});

function sendRequest(id: number): Promise<void> {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const startHr = process.hrtime.bigint();

		const timeout = setTimeout(() => {
			results.push({
				request: id,
				startTime,
				endTime: Date.now(),
				latencyMs: REQUEST_TIMEOUT_MS,
				statusCode: 0
			});

			pendingRequests.delete(id);
			resolve();
		}, REQUEST_TIMEOUT_MS);

		pendingRequests.set(id, {
			startTime,
			startHr,
			timeout,
			resolve
		});

		client.publish(
			REQUEST_TOPIC,
			JSON.stringify({ id, message: PAYLOAD }),
			(err) => {
				if (err) {
					clearTimeout(timeout);

					results.push({
						request: id,
						startTime,
						endTime: Date.now(),
						latencyMs: 0,
						statusCode: 0
					});

					pendingRequests.delete(id);
					resolve();
				}
			}
		);
	});
}

async function runAll() {
	await waitForConnection();

	const testStartTime = Date.now();

	const executing: Promise<void>[] = [];

	for (let i = 1; i <= TOTAL_REQUESTS; i++) {
		const promise = sendRequest(i);

		executing.push(promise);

		if (executing.length >= CONCURRENCY) {
			await Promise.all(executing);
			executing.length = 0;
		}
	}

	if (executing.length > 0) {
		await Promise.all(executing);
	}

	const testEndTime = Date.now();
	const totalExecutionTimeMs = testEndTime - testStartTime;

	const successfulRequests = results.filter((r) => r.statusCode === 200).length;

	const failedRequests = results.length - successfulRequests;

	const throughputReqPerSec = successfulRequests / (totalExecutionTimeMs / 1000);

	const latencies = results
		.filter((r) => r.statusCode === 200)
		.map((r) => r.latencyMs);

	if (latencies.length === 0) {
		throw new Error('Nenhuma requisição bem-sucedida foi registrada');
	}

	const averageLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
	const latencyBounds = minMax(latencies);

	results.sort((a, b) => a.request - b.request);

	if (!OUTPUT_PATH) {
		throw new Error('OUTPUT_PATH não definido');
	}

	const output = {
		payloadSizeBytes: PAYLOAD_SIZE,
		totalRequests: TOTAL_REQUESTS,
		concurrency: CONCURRENCY,

		startTime: testStartTime,
		endTime: testEndTime,
		totalExecutionTimeMs,

		successfulRequests,
		failedRequests,

		throughputReqPerSec,

		averageLatencyMs,
		minLatencyMs: latencyBounds.min,
		maxLatencyMs: latencyBounds.max,

		p50LatencyMs: percentile(latencies, 50),
		p95LatencyMs: percentile(latencies, 95),
		p99LatencyMs: percentile(latencies, 99),

		results
	};

	const resolvedOutputPath = path.resolve(OUTPUT_PATH);

	fs.mkdirSync(path.dirname(resolvedOutputPath), {recursive: true});

	fs.writeFileSync(resolvedOutputPath, JSON.stringify(output, null, 2));

	console.log(`Resultados salvos em ${resolvedOutputPath}`);
	console.log(`Tempo total de execução: ${totalExecutionTimeMs}ms (${(totalExecutionTimeMs / 1000).toFixed(2)}s)`);

	client.end(false, {}, () => {
		process.exit(0);
	});
}

runAll().catch((err) => {
	console.error(err);

	client.end(false, {}, () => {
		process.exit(1);
	});
});
