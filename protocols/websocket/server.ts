import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
	if (req.url === '/health') {
		res.writeHead(200);
		res.end('OK');
		return;
	}

	res.writeHead(404);
	res.end();
});

const wss = new WebSocketServer({
	server
});

wss.on('connection', (socket) => {

	socket.on('message', (message) => {
		const data = JSON.parse(message.toString());

		socket.send(JSON.stringify({
			id: data.id,
			message: data.message,
			timestamp: Date.now()
		}));
	});

});

server.listen(PORT, () => {
	console.log('Servidor WebSocket rodando na porta 3000');
});
