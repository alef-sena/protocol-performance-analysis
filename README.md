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
python3 analysis/analyze_metrics.py
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

# criar gráficos de métricas em data/processed
python3 analysis/analyze_metrics.py
```

## Estrutura

```sh
.
├── LICENSE
├── README.md
├── analysis
│   └── analyze_metrics.py
├── config
│   ├── test-settings.json
│   └── workload.json
├── data
│   ├── processed
│   │   └── http
│   │       ├── aggregates
│   │       │   ├── <XXX>req-<YYY>kb-<ZZZ>conc
│   │       │   │   ├── global-summary.json
│   │       │   │   └── summary.json
│   │       ├── comparisons
│   │       │   ├── comparison-summary.json
│   │       │   ├── cpu-comparison-http.png
│   │       │   ├── latency-comparison-http.png
│   │       │   ├── memory-comparison-http.png
│   │       │   ├── p50-comparison-http.png
│   │       │   ├── p95-comparison-http.png
│   │       │   ├── p99-comparison-http.png
│   │       │   └── throughput-comparison-http.png
│   │       └── runs
│   │           └── <XXX>req-<YYY>kb-<ZZZ>conc
│   │               └── run-1
│   │                   └── http
│   │                       ├── cpu.png
│   │                       ├── latency.png
│   │                       ├── memory.png
│   │                       └── throughput.png
│   └── raw
│       └── <XXX>req-<YYY>kb-<ZZZ>conc
│           └── run-<N>
│               └── http
│                   ├── request-results.json
│                   └── resource-usage.json
├── docker
│   ├── grpc
│   ├── http
│   │   ├── Dockerfile.client
│   │   └── Dockerfile.server
│   ├── mqtt
│   ├── rabbitmq
│   └── websocket
├── docker-compose.yaml
├── docs
├── package-lock.json
├── package.json
├── protocols
│   ├── grpc
│   ├── http
│   │   ├── client.ts
│   │   └── server.ts
│   ├── mqtt
│   ├── rabbitmq
│   └── websocket
├── scripts
│   ├── collect-container-stats.ts
│   ├── orchestrator.ts
│   └── run-autocannon.ts
└── tsconfig.json
```

## Funcionamento

O benchmark é executado pelos clients localizados em:

protocols/<protocolo>/client.ts

O orchestrator é responsável apenas pela orquestração dos testes.
