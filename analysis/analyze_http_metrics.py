import json
import os
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

RAW_RESULTS_DIR = 'data/raw/http/request-results'
RAW_USAGE_DIR = 'data/raw/http/resource-usage'
OUTPUT_DIR = 'data/processed/http'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Listar todos os arquivos de resultados
for filename in os.listdir(RAW_RESULTS_DIR):
    if not filename.endswith('.json'):
        continue

    name = filename.replace('.json', '')  # ex: 1000req-1kb
    result_path = os.path.join(RAW_RESULTS_DIR, filename)
    usage_path = os.path.join(RAW_USAGE_DIR, filename)

    if not os.path.exists(usage_path):
        print(f'Skipping {name}, missing usage file.')
        continue

    output_subdir = os.path.join(OUTPUT_DIR, name)
    os.makedirs(output_subdir, exist_ok=True)

    with open(result_path) as f:
        raw = json.load(f)
        results = raw["results"]
        payload_size = raw.get("payloadSizeBytes", 0)

    with open(usage_path) as f:
        usage = json.load(f)

    # --- Processar resultados de requisição
    start_times = [r['startTime'] for r in results]
    end_times = [r['endTime'] for r in results]
    latency_ms = [(e - s) for s, e in zip(start_times, end_times)]
    relative_times = [(s - min(start_times)) / 1000 for s in start_times]  # segundos
    request_ids = [r['request'] for r in results]

    # --- Gráfico: Latência Média por Bloco de Requisições
    n_points = 100
    block_size = max(1, len(results) // n_points)
    avg_request_ids = []
    avg_latencies = []

    for i in range(0, len(results), block_size):
        block = latency_ms[i:i + block_size]
        block_ids = request_ids[i:i + block_size]
        if block:
            avg_request_ids.append(sum(block_ids) / len(block_ids))
            avg_latencies.append(sum(block) / len(block))

    plt.figure(figsize=(10, 4))
    plt.plot(avg_request_ids, avg_latencies, color='orange')
    plt.title(f'Latência Média ({block_size} req/bloco)')
    plt.xlabel('ID Médio do Bloco')
    plt.ylabel('Latência Média (ms)')
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(f'{output_subdir}/latency.png')
    plt.close()

    # --- Gráfico: CPU
    timestamps = [e['timestamp'] for e in usage]
    cpu = [e['cpu'] * 100 for e in usage]  # converter para porcentagem
    t0 = min(timestamps)
    relative_cpu_time = [(t - t0) / 1000 for t in timestamps]

    plt.figure(figsize=(8, 4))
    plt.plot(relative_cpu_time, cpu, color='blue')
    plt.title('Uso de CPU (%)')
    plt.xlabel('Tempo (s)')
    plt.ylabel('CPU (%)')
    plt.grid(True)

    max_cpu = max(cpu)
    max_idx = cpu.index(max_cpu)
    plt.annotate(f'{max_cpu:.2f}%', (relative_cpu_time[max_idx], max_cpu), textcoords="offset points", xytext=(0, 10), ha='center', fontsize=8)

    plt.tight_layout()
    plt.savefig(f'{output_subdir}/cpu.png')
    plt.close()

    # --- Gráfico: Memória
    mem = [e['memoryMB'] for e in usage]

    plt.figure(figsize=(8, 4))
    plt.plot(relative_cpu_time, mem, color='green')
    plt.title('Uso de Memória (MB)')
    plt.xlabel('Tempo (s)')
    plt.ylabel('Memória (MB)')
    plt.grid(True)

    max_mem = max(mem)
    max_idx = mem.index(max_mem)
    plt.annotate(f'{max_mem:.2f} MB', (relative_cpu_time[max_idx], max_mem), textcoords="offset points", xytext=(0, 10), ha='center', fontsize=8)

    plt.tight_layout()
    plt.savefig(f'{output_subdir}/memory.png')
    plt.close()

    # --- Gráfico: Throughput
    df = pd.DataFrame({'relative_time': relative_times})
    df['time_block'] = (df['relative_time']).astype(int)
    throughput_block = df.groupby('time_block').size()

    plt.figure(figsize=(10, 4))
    plt.plot(throughput_block.index, throughput_block.values, color='purple')
    plt.title('Throughput (Requisições por Segundo)')
    plt.xlabel('Tempo (s)')
    plt.ylabel('Req/s')
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(f'{output_subdir}/throughput.png')
    plt.close()

    print(f'Gráficos salvos em: {output_subdir}')
