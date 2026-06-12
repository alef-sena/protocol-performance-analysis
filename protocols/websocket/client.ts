import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

const TARGET = process.env.TARGET || 'ws://websocket-server:3000';
const PAYLOAD_SIZE = parseInt(process.env.PAYLOAD_KB || '1') * 1024;
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '10000');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000');
const OUTPUT_PATH = process.env.OUTPUT_PATH;
const PAYLOAD = 'x'.repeat(PAYLOAD_SIZE);

const results: {
	request: number;
	startTime: number;
	endTime: number;
	latencyMs: number;
	statusCode: number;
}[] = [];

const socket = new WebSocket(TARGET);

const pendingRequests = new Map<
	number,
	{
		resolve: () => void;
		timeout: NodeJS.Timeout;
		startTime: number;
		startHr: bigint;
	}
>();

function percentile(
	values: number[],
	p: number
): number {
	const sorted = [...values].sort((a, b) => a - b);

	const index = Math.ceil((p / 100) * sorted.length) - 1;

	return sorted[Math.max(0, index)];
}

async function sendRequest(
	id: number
): Promise<void> {

	return new Promise((resolve) => {

		const payload = JSON.stringify({
			id,
			message: PAYLOAD
		});

		const startTime = Date.now();

		const startHr = process.hrtime.bigint();

		const timeout = setTimeout(() => {
			const endTime = Date.now();
			const endHr = process.hrtime.bigint();

			results.push({
				request: id,
				startTime,
				endTime,
				latencyMs: Number( endHr - startHr ) / 1_000_000,
				statusCode: 0
			});

			pendingRequests.delete(id);

			resolve();

		}, REQUEST_TIMEOUT_MS);

		pendingRequests.set(
			id,
			{
				resolve,
				timeout,
				startTime,
				startHr
			}
		);

		socket.send(payload);
	});
}

async function runAll() {

	const testStartTime = Date.now();

	const batches: number[][] = [];

	for ( let i = 1; i <= TOTAL_REQUESTS; i += CONCURRENCY ) {
		const batch: number[] = [];

		for ( let j = i; j < i + CONCURRENCY && j <= TOTAL_REQUESTS; j++ ) {
			batch.push(j);
		}

		batches.push(batch);
	}

	for (const batch of batches) {
		await Promise.all(batch.map(sendRequest));
	}

	const testEndTime = Date.now();

	const totalExecutionTimeMs = testEndTime - testStartTime;

	const successfulRequests = results.filter(
		r => r.statusCode === 200
	).length;

	const failedRequests = results.length - successfulRequests;

	const throughputReqPerSec = TOTAL_REQUESTS / (totalExecutionTimeMs / 1000);

	const latencies = results.map(r => r.latencyMs);

	const averageLatencyMs = latencies.reduce(
		(a, b) => a + b,
		0
	) / latencies.length;

	const minLatencyMs = Math.min(...latencies);
	const maxLatencyMs = Math.max(...latencies);

	const p50LatencyMs = percentile(latencies, 50);
	const p95LatencyMs = percentile(latencies, 95);
	const p99LatencyMs = percentile(latencies, 99);

	if (!OUTPUT_PATH) {
		throw new Error('OUTPUT_PATH não definido');
	}

	const resolvedOutputPath = path.resolve(OUTPUT_PATH);

	fs.mkdirSync(
		path.dirname(resolvedOutputPath),
		{ recursive: true }
	);

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
		minLatencyMs,
		maxLatencyMs,

		p50LatencyMs,
		p95LatencyMs,
		p99LatencyMs,

		results
	};

	fs.writeFileSync(
		resolvedOutputPath,
		JSON.stringify(output, null, 2)
	);

	
	socket.close();
	console.log(`Resultados das requisições salvos em ${resolvedOutputPath}`);
	console.log(`Tempo total de execução: ${totalExecutionTimeMs}ms (${(totalExecutionTimeMs / 1000).toFixed(2)}s)`);
}

socket.on('message', (data) => {
	const response = JSON.parse(
		data.toString()
	);

	const pending = pendingRequests.get(
		response.id
	);

	if (!pending) {
		return;
	}

	clearTimeout(pending.timeout);

	const endTime = Date.now();
	const endHr = process.hrtime.bigint();

	results.push({
		request: response.id,
		startTime: pending.startTime,
		endTime,
		latencyMs:
			Number(
				endHr - pending.startHr
			) / 1_000_000,
		statusCode: 200
	});

	pending.resolve();

	pendingRequests.delete(response.id);
});

socket.on('open', () => { runAll().catch(console.error) });

socket.on('close', () => { process.exit(0) });

socket.on('error',
	(err) => {
		console.error('Erro no cliente WebSocket:',err);
		process.exit(1);
	}
);
