import fs from 'fs';
import path from 'path';
import { fetch } from 'undici';

const HOST = process.env.TARGET?.split(':')[0] || 'localhost';
const PORT = Number(process.env.TARGET?.split(':')[1]) || 3000;
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '10000');
const PAYLOAD_SIZE = parseInt(process.env.PAYLOAD_KB || '1') * 1024;
const CONCURRENCY = 1;
const PAYLOAD = 'x'.repeat(PAYLOAD_SIZE);

const results: {
	request: number;
	startTime: number;
	endTime: number;
	statusCode: number;
}[] = [];

let completedRequests = 0;

async function sendRequest(i: number): Promise<void> {
	const payload = JSON.stringify({ message: PAYLOAD });
	const url = `http://${HOST}:${PORT}/process`;

	const start = Date.now();

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(payload).toString(),
			},
			body: payload,
		});

		const end = Date.now();

		results.push({
			request: i,
			startTime: start,
			endTime: end,
			statusCode: res.status,
		});
	} catch (error: any) {
		const end = Date.now();

		results.push({
			request: i,
			startTime: start,
			endTime: end,
			statusCode: 0,
		});

		console.error(`Erro na requisição ${i}:`, error.message);
	}

	completedRequests++;
}

async function runBatch(batch: number[]) {
	await Promise.all(batch.map(sendRequest));
}

async function runAll() {
	const batches = [];

	for (let i = 1; i <= TOTAL_REQUESTS; i += CONCURRENCY) {
		const batch = [];
		for (let j = i; j < i + CONCURRENCY && j <= TOTAL_REQUESTS; j++) {
			batch.push(j);
		}
		batches.push(batch);
	}

	for (const batch of batches) {
		await runBatch(batch);
	}

	const filename = `${TOTAL_REQUESTS}req-${PAYLOAD_SIZE / 1024}kb.json`;
	const outputPath = path.resolve('data/raw/http/request-results', filename);

	fs.writeFileSync(outputPath, JSON.stringify({
		payloadSizeBytes: PAYLOAD_SIZE,
		results,
	}, null, 2));

	console.log(`Resultados salvos em ${outputPath}`);
}

runAll();
