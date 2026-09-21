import fs from 'fs';
import http from 'http';
import path from 'path';

const HOST = process.env.TARGET?.split(':')[0] || 'localhost';
const PORT = Number(process.env.TARGET?.split(':')[1]) || 3000;
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '10000');
const PAYLOAD_SIZE = parseInt(process.env.PAYLOAD_KB || '1') * 1024;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000');
const PAYLOAD = 'x'.repeat(PAYLOAD_SIZE);
const AGENT = new http.Agent({
	keepAlive: true,
	maxSockets: CONCURRENCY,
	maxFreeSockets: CONCURRENCY,
	timeout: REQUEST_TIMEOUT_MS
});

const results: {
	request: number;
	startTime: number;
	endTime: number;
	latencyMs: number;
	statusCode: number;
}[] = [];

let completedRequests = 0;

async function sendRequest(i: number): Promise<void> {
	const startTimestamp = Date.now();
	const startHr = process.hrtime.bigint();
	const requestBody = JSON.stringify({
		id: i,
		message: PAYLOAD
	});
	const requestBodyLength = Buffer.byteLength(requestBody).toString();

	return new Promise((resolve) => {
		const request = http.request(
			{
				host: HOST,
				port: PORT,
				path: '/process',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': requestBodyLength,
				},
				timeout: REQUEST_TIMEOUT_MS,
				agent: AGENT,
			},
			(response) => {
				const responseChunks: Buffer[] = [];

				response.on('data', (chunk) => {
					responseChunks.push(Buffer.from(chunk));
				});

				response.on('end', () => {
					let responseIdMatches = false;

					try {
						const responseData = JSON.parse(
							Buffer.concat(responseChunks).toString()
						);
						responseIdMatches = responseData.id === i;
					} catch {
						responseIdMatches = false;
					}

					const endHr = process.hrtime.bigint();
					const endTimestamp = Date.now();

					const latencyMs =
						Number(endHr - startHr) / 1_000_000;

					results.push({
						request: i,
						startTime: startTimestamp,
						endTime: endTimestamp,
						latencyMs,
						statusCode: responseIdMatches
							? response.statusCode || 0
							: 0,
					});

					completedRequests++;
					resolve();
				});
			}
		);

		request.on('timeout', () => {
			request.destroy(new Error('Request timeout'));
		});

		request.on('error', (error: any) => {
			const endHr = process.hrtime.bigint();
			const endTimestamp = Date.now();

			const latencyMs =
				Number(endHr - startHr) / 1_000_000;

			results.push({
				request: i,
				startTime: startTimestamp,
				endTime: endTimestamp,
				latencyMs,
				statusCode: 0,
			});

			if (error.message === 'Request timeout') {
				console.error(
					`Requisição ${i} expirou após ${REQUEST_TIMEOUT_MS}ms`
				);
			} else {
				console.error(
					`Erro na requisição ${i}:`,
					error.message
				);
			}

			completedRequests++;
			resolve();
		});

		request.end(requestBody);
	});
}

async function runBatch(batch: number[]) {
	await Promise.all(batch.map(sendRequest));
}

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

async function runAll() {
	const testStartTime = Date.now();

	for (let i = 1; i <= TOTAL_REQUESTS; i += CONCURRENCY) {
		const batch: number[] = [];

		for (
			let j = i;
			j < i + CONCURRENCY && j <= TOTAL_REQUESTS;
			j++
		) {
			batch.push(j);
		}

		await runBatch(batch);
	}

	const testEndTime = Date.now();

	const totalExecutionTimeMs = testEndTime - testStartTime;

	const successfulRequests = results.filter(
		(r) => r.statusCode >= 200 && r.statusCode < 400
	).length;

	const failedRequests = results.length - successfulRequests;

	const throughputReqPerSec =
		TOTAL_REQUESTS / (totalExecutionTimeMs / 1000);

	const latencies = results.map(
		r => r.latencyMs
	);

	const averageLatencyMs =
		latencies.reduce((a, b) => a + b, 0) / latencies.length;

	const latencyBounds = minMax(latencies);

	const outputPath = process.env.OUTPUT_PATH;

	if (!outputPath) {
		throw new Error('OUTPUT_PATH não definido');
	}

	const resolvedOutputPath = path.resolve(outputPath);

	fs.mkdirSync(path.dirname(resolvedOutputPath), {
		recursive: true,
	});

	const p50LatencyMs = percentile(latencies, 50);
	const p95LatencyMs = percentile(latencies, 95);
	const p99LatencyMs = percentile(latencies, 99);

	const payload = {
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

		p50LatencyMs,
		p95LatencyMs,
		p99LatencyMs,

		results,
	};

	fs.writeFileSync(
		resolvedOutputPath,
		JSON.stringify(payload, null, 2)
	);

	console.log(`Resultados das requisições salvos em ${resolvedOutputPath}`);
	console.log(`Tempo total de execução: ${totalExecutionTimeMs}ms (${(totalExecutionTimeMs / 1000).toFixed(2)}s)`);

	AGENT.destroy();
}

runAll();
