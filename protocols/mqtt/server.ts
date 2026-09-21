import fs from 'fs';
import mqtt from 'mqtt';

const BROKER_URL = process.env.BROKER_URL || 'mqtt://localhost:1883';
const REQUEST_TOPIC = 'benchmark/request';
const RESPONSE_TOPIC = 'benchmark/response';
const READY_FILE = '/tmp/mqtt-app-ready';

const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {

	client.subscribe(REQUEST_TOPIC, (err) => {
		if (err) {
			console.error('Erro ao se inscrever no tópico:', err);
			return;
		}

		fs.writeFileSync(READY_FILE, String(Date.now()));
		console.log('Servidor MQTT pronto');
	});
});

client.on('message', (topic, message) => {
	if (topic !== REQUEST_TOPIC) {
		return;
	}

	try {
		const data = JSON.parse(message.toString());

		const response = {
			id: data.id,
			message: data.message,
			timestamp: Date.now()
		};

		client.publish(
			RESPONSE_TOPIC,
			JSON.stringify(response)
		);

	} catch (error) {
		console.error('Erro ao processar mensagem MQTT:', error);
	}
});

client.on('error', (err) => {
	console.error('Erro MQTT:', err);
});

process.stdin.resume();
