# Avaliação de desempenho de protocolos de comunicação em sistemas distribuídos

```txt
protocol-performance-analysis/
│
├── protocols/                  # Código-fonte dos servidores e clientes para cada protocolo
│   ├── http/
│   ├── websocket/
│   ├── grpc/
│   ├── mqtt/
│   └── rabbitmq/
│
├── scripts/                    # Scripts de automação (testes, coleta, orquestração)
│   └── setup-env.sh            # Inicialização de containers Docker, etc.
│
├── data/                       # Armazenamento de dados coletados durante os testes
│   ├── raw/                    # Arquivos brutos de saída
│   └── processed/              # Dados limpos e prontos para análise
│
├── analysis/                   # Scripts e notebooks para análise e geração de gráficos
│   ├── analyze.ipynb           # Jupyter notebook com pandas/matplotlib
│   └── plot-metrics.py         # Geração automática de gráficos
│
├── docker/                     # Configurações dos containers
│   ├── docker-compose.yml
│   └── mqtt.Dockerfile
│
├── docs/                       # Documentações
│   ├── metodologia.md
│   └── cronograma.pdf
│
├── .gitignore
├── README.md
├── package.json
└── tsconfig.json
```
