import fs from 'fs';
import path from 'path';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const TARGET = process.env.TARGET || 'grpc-server:50051';

const PAYLOAD_SIZE = parseInt(process.env.PAYLOAD_KB || '1') * 1024;

const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '10000');

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');

const OUTPUT_PATH = process.env.OUTPUT_PATH;

const PAYLOAD = 'x'.repeat(PAYLOAD_SIZE);

const PROTO_PATH = path.join(
	__dirname,
	'proto',
	'message.proto'
);

const packageDefinition =
	protoLoader.loadSync(
		PROTO_PATH,
		{
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true
		}
	);

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;

const client = new protoDescriptor.benchmark.BenchmarkService(
		TARGET,
		grpc.credentials.createInsecure()
	);

const results: {
	request: number;
	startTime: number;
	endTime: number;
	latencyMs: number;
	statusCode: number;
}[] = [];

function waitForConnection(): Promise<void> {
	return new Promise((resolve, reject) => {
		const deadline = new Date(
			Date.now() + Number(process.env.REQUEST_TIMEOUT_MS || 30000)
		);

		client.waitForReady(deadline, (error?: Error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

function percentile(
	values: number[],
	p: number
): number {

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

async function sendRequest(
	id: number
): Promise<void> {

	return new Promise(
		(resolve) => {

			const startTime = Date.now();

			const startHr = process.hrtime.bigint();

			client.SendMessage(
				{
					id,
					message: PAYLOAD
				},
				{
					deadline: Date.now() + Number(process.env.REQUEST_TIMEOUT_MS || 30000)
				},
				(error: any, response: any) => {

					const endTime = Date.now();
					const endHr = process.hrtime.bigint();

					const responseIdMatches = !error && response?.id === id;

					results.push({
						request: id,
						startTime,
						endTime,
						latencyMs: Number(endHr - startHr) / 1_000_000,
						statusCode: responseIdMatches ? 200 : 0
					});

					resolve();
				}
			);
		}
	);
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

	const successfulRequests = results.filter(r => r.statusCode === 200).length;
	const failedRequests = results.length -successfulRequests;

	const throughputReqPerSec = successfulRequests / (totalExecutionTimeMs / 1000);

	const latencies = results.map(r => r.latencyMs);

	if (latencies.length === 0) {
		throw new Error('Nenhuma requisição foi registrada');
	}
	const averageLatencyMs = latencies.reduce((a, b) => a + b,0) / latencies.length;
	const latencyBounds = minMax(latencies);

	if (!OUTPUT_PATH) {
		throw new Error('OUTPUT_PATH não definido');
	}

	results.sort((a, b) => a.request - b.request);

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
}

runAll().catch(console.error);
