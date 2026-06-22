import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
	if (req.method === 'POST' && req.url === '/process') {
		let body = '';

		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', () => {
			const data = JSON.parse(body);

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				id: data.id,
				message: data.message,
				timestamp: Date.now()
			}));
		});
	} else if (req.method === 'GET' && req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok' }));
	} else {
		res.writeHead(404);
		res.end();
	}
});

server.listen(PORT, () => {
	console.log(`Servidor HTTP rodando na porta ${PORT}`);
});

const shutdown = () => {
	console.log('Encerrando servidor HTTP...');
	server.close(() => {
		console.log('Servidor HTTP finalizado.');
		process.exit(0);
	});
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
