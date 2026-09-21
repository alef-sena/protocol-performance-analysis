#!/bin/sh

set -e

rm -f /tmp/mqtt-app-ready

echo "Iniciando Mosquitto..."

mosquitto -c /app/docker/mqtt/mosquitto.conf &

echo "Aguardando Mosquitto ficar disponível na porta 1883..."

for i in $(seq 1 50); do
	if nc -z localhost 1883; then
		echo "Mosquitto pronto na porta 1883"
		break
	fi

	sleep 0.2
done

if ! nc -z localhost 1883; then
	echo "Mosquitto não iniciou corretamente"
	exit 1
fi

echo "Iniciando servidor MQTT da aplicação..."

npx ts-node protocols/mqtt/server.ts
