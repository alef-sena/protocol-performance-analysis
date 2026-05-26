# Avaliação de desempenho de protocolos de comunicação em sistemas distribuídos

## Docker

* **Isolar o ambiente de cada protocolo**
* **Executar testes de forma padronizada**
* **Facilitar a execução com `docker compose up`**
* **Controlar recursos e concorrência por protocolo**

### Execução do Teste com Docker

```bash
# execução automática
npm run execute:all

npx ts-node scripts/orchestrator.ts

# execução manual
# docker compose up --build
docker compose up -d http-server
docker compose run --rm http-client
python3 analysis/analyze_http_metrics.py
```

Isso irá:

1. Subir o servidor HTTP no container
2. Rodar o cliente HTTP no outro container
3. Salvar os dados em volume compartilhado ou bind mount (se necessário)

O http-server será acessível no Docker pela URL http-server:3000
A variável TARGET é lida no client.ts
A requisição é feita para HOST:PORT, com os valores de TARGET
O script salva normalmente os dados no data/raw/http/results.json

## Protocolos

### HTTP

```bash
# executar testes
npm run http:test

# criar gráficos de métricas em data/processed/http
python3 analysis/analyze_http_metrics.py
```
