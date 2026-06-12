import fs from 'fs';
import path from 'path';

const HOST = process.env.TARGET?.split(':')[0] || 'localhost';
const PORT = Number(process.env.TARGET?.split(':')[1]) || 3000;
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '10000');
const PAYLOAD_SIZE = parseInt(process.env.PAYLOAD_KB || '1') * 1024;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000');
const PAYLOAD = 'x'.repeat(PAYLOAD_SIZE);

const results: {
	request: number;
	startTime: number;
	endTime: number;
	latencyMs: number;
	statusCode: number;
}[] = [];

let completedRequests = 0;

async function sendRequest(i: number): Promise<void> {
	const payload = JSON.stringify({
		message: PAYLOAD
	});

	const url = `http://${HOST}:${PORT}/process`;

	const startTimestamp = Date.now();
	const startHr = process.hrtime.bigint();

	const controller = new AbortController();

	const timeout = setTimeout(() => {
		controller.abort();
	}, REQUEST_TIMEOUT_MS);

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length':
					Buffer.byteLength(payload).toString(),
			},
			body: payload,
			signal: controller.signal,
		});

		clearTimeout(timeout);

		const endHr = process.hrtime.bigint();
		const endTimestamp = Date.now();

		const latencyMs =
			Number(endHr - startHr) / 1_000_000;

		results.push({
			request: i,
			startTime: startTimestamp,
			endTime: endTimestamp,
			latencyMs,
			statusCode: res.status,
		});
	} catch (error: any) {
		clearTimeout(timeout);

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

		if (error.name === 'AbortError') {
			console.error(
				`Requisição ${i} expirou após ${REQUEST_TIMEOUT_MS}ms`
			);
		} else {
			console.error(
				`Erro na requisição ${i}:`,
				error.message
			);
		}
	}

	completedRequests++;
}

async function runBatch(batch: number[]) {
	await Promise.all(batch.map(sendRequest));
}

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

async function runAll() {
	const batches: number[][] = [];

	for (let i = 1; i <= TOTAL_REQUESTS; i += CONCURRENCY) {
		const batch: number[] = [];

		for (
			let j = i;
			j < i + CONCURRENCY && j <= TOTAL_REQUESTS;
			j++
		) {
			batch.push(j);
		}

		batches.push(batch);
	}

	const testStartTime = Date.now();

	for (const batch of batches) {
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

	const minLatencyMs = Math.min(...latencies);
	const maxLatencyMs = Math.max(...latencies);

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
		minLatencyMs,
		maxLatencyMs,

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
}

runAll();
