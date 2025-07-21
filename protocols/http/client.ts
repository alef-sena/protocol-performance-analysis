import http from 'http';
import fs from 'fs';
import path from 'path';

const HOST = process.env.TARGET?.split(':')[0] || 'localhost';
const PORT = Number(process.env.TARGET?.split(':')[1]) || 3000;
const TOTAL_REQUESTS = 100000;
const CONCURRENCY = 1;
// 1024 // 1 KB
const PAYLOAD_SIZE = 1024 * 100;
const PAYLOAD = 'x'.repeat(PAYLOAD_SIZE);

const results: {
	request: number;
	startTime: number;
	endTime: number;
	statusCode: number;
}[] = [];

let completedRequests = 0;

async function sendRequest(i: number): Promise<void> {
	return new Promise((resolve) => {
		const payload = JSON.stringify({ message: PAYLOAD });

		const options = {
			hostname: HOST,
			port: PORT,
			path: '/process',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(payload),
			},
		};

		const start = Date.now();

		const req = http.request(options, (res) => {
			res.on('data', () => {});

			res.on('end', () => {
				const end = Date.now();
				results.push({
					request: i,
					startTime: start,
					endTime: end,
					statusCode: res.statusCode || 0,
				});
				completedRequests++;
				resolve();
			});
		});

		req.on('error', (error) => {
			const end = Date.now();
			results.push({
				request: i,
				startTime: start,
				endTime: end,
				statusCode: 0,
			});
			console.error(`Erro na requisição ${i}:`, error.message);
			completedRequests++;
			resolve();
		});

		req.write(payload);
		req.end();
	});
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

	const outputPath = path.resolve('data/raw/http-results.json');
	fs.writeFileSync(outputPath, JSON.stringify({
		payloadSizeBytes: PAYLOAD_SIZE,
		results,
	}, null, 2));

	console.log(`Resultados salvos em ${outputPath}`);
}

runAll();
