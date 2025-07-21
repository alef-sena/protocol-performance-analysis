import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 3000;

const resourceUsage: { timestamp: number; cpu: number; memoryMB: number }[] = [];

const server = http.createServer((req, res) => {
	if (req.method === 'POST' && req.url === '/process') {
		let body = '';

		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', () => {
			const data = JSON.parse(body);

			const result = {
				received: data,
				timestamp: Date.now(),
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(result));
		});
	} else if (req.method === 'GET' && req.url === '/health') {
		// ✅ Endpoint usado por orchestrator.ts para verificar se o servidor está pronto
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok' }));
	} else {
		res.writeHead(404);
		res.end();
	}
});

server.listen(PORT, () => {
	console.log(`Servidor HTTP rodando na porta ${PORT}`);
	startMonitoring();
});

const usageOutPath = path.resolve('data/raw/http-resource-usage.json');
let cpuStart = process.cpuUsage();
let timeStart = Date.now();
let monitorInterval: NodeJS.Timeout;

function startMonitoring() {
	monitorInterval = setInterval(() => {
		const cpuNow = process.cpuUsage(cpuStart);
		const timeNow = Date.now();
		const elapsedTime = timeNow - timeStart;

		const userCPU = cpuNow.user / 1000;
		const systemCPU = cpuNow.system / 1000;
		const totalCPU = userCPU + systemCPU;
		const cpuPercent = (totalCPU / elapsedTime) * 100;

		resourceUsage.push({
			timestamp: timeNow,
			cpu: cpuPercent,
			memoryMB: process.memoryUsage().rss / 1024 / 1024,
		});

		cpuStart = process.cpuUsage();
		timeStart = timeNow;
	}, 1000);
}

function stopMonitoringAndSave() {
	clearInterval(monitorInterval);
	fs.writeFileSync(usageOutPath, JSON.stringify(resourceUsage, null, 2));
	console.log(`Uso de recursos salvo em ${usageOutPath}`);
}

const shutdown = () => {
	console.log('Encerrando servidor HTTP...');
	stopMonitoringAndSave();
	server.close(() => {
		console.log('Servidor HTTP finalizado.');
		process.exit(0);
	});
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
