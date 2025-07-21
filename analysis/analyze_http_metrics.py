import json
import os
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from math import ceil

# Caminhos
raw_usage_path = 'data/raw/http-resource-usage.json'
raw_results_path = 'data/raw/http-results.json'
output_dir = 'data/processed/http'
os.makedirs(output_dir, exist_ok=True)

# --- Carregar dados
with open(raw_usage_path) as f:
    usage = json.load(f)

with open(raw_results_path) as f:
    raw = json.load(f)
    results = raw["results"]
    payload_size = raw.get("payloadSizeBytes", 0)

# --- Extrair e normalizar tempos
start_times = [r['startTime'] for r in results]
end_times = [r['endTime'] for r in results]
latency = [(e - s) for s, e in zip(start_times, end_times)]

# Base de tempo (t0)
t0 = min(start_times)
relative_times = [(t - t0) / 1000 for t in start_times]  # em segundos

# Timestamps simulados para CPU/memória
# timestamps = list(range(len(usage)))
# cpu = [e['cpu'] for e in usage]
# mem = [e['memoryMB'] for e in usage]

# # --- Estatísticas
# total_duration = max(end_times) - min(start_times)  # ms
# throughput_total = (len(results) / total_duration) * 1000  # req/s

# stats = {
#     'Throughput': f'{throughput_total:.2f} req/s',
#     'Payload': f'{payload_size} bytes',
#     'Latência média': f'{np.mean(latency):.2f} ms',
#     'Latência máxima': f'{np.max(latency):.2f} ms',
#     'Latência mínima': f'{np.min(latency):.2f} ms',
#     'CPU média': f'{np.mean(cpu):.2f}%',
#     'Memória média': f'{np.mean(mem):.2f} MB',
# }

# # --- Exibir no terminal
# print('\n--- Estatísticas ---')
# for k, v in stats.items():
#     print(f'{k}: {v}')

# # --- Salvar stats.txt
# with open(f'{output_dir}/stats.txt', 'w') as f:
#     for k, v in stats.items():
#         f.write(f'{k}: {v}\n')

# --- Gráfico: Latência Média por Bloco de Requisições
request_ids = [r['request'] for r in results]
latency_ms = [(r['endTime'] - r['startTime']) for r in results]

n_points = 100
block_size = max(1, len(results) // n_points)

avg_request_ids = []
avg_latencies = []

for i in range(0, len(results), block_size):
    block_ids = request_ids[i:i+block_size]
    block_latencies = latency_ms[i:i+block_size]
    if block_ids and block_latencies:
        avg_request_ids.append(sum(block_ids) / len(block_ids))
        avg_latencies.append(sum(block_latencies) / len(block_latencies))

plt.figure(figsize=(10, 4))
plt.plot(avg_request_ids, avg_latencies, color='orange')
plt.title(f'Latência Média a cada {block_size} Requisições')
plt.xlabel('ID Médio do Bloco de Requisições')
plt.ylabel('Latência Média (ms)')
plt.grid(True)

plt.tight_layout()
plt.savefig(f'{output_dir}/latency.png')
plt.close()

# --- Gráfico: CPU
timestamps_raw = [e['timestamp'] for e in usage]
t0 = min(timestamps_raw)
relative_cpu_time = [(t - t0) / 1000 for t in timestamps_raw]
usage_timestamps = [(e['timestamp'] - t0) / 1000 for e in usage]
cpu = [e['cpu'] for e in usage]

plt.figure(figsize=(8, 4))
plt.plot(usage_timestamps, cpu, color='blue')
plt.title('Uso de CPU (%) ao Longo do Tempo')
plt.xlabel('Tempo (s)')
plt.ylabel('CPU (%)')
plt.grid(True)

max_cpu = max(cpu)
max_idx = cpu.index(max_cpu)
plt.annotate(f'{max_cpu:.2f}%', (relative_cpu_time[max_idx], max_cpu), textcoords="offset points", xytext=(0, 10), ha='center', fontsize=8)

plt.tight_layout()
plt.savefig(f'{output_dir}/cpu.png')
plt.close()

# --- Gráfico: Memória
mem = [e['memoryMB'] for e in usage]

plt.figure(figsize=(8, 4))
plt.plot(usage_timestamps, mem, color='green')
plt.title('Uso de Memória (MB) ao Longo do Tempo')
plt.xlabel('Tempo (s)')
plt.ylabel('Memória (MB)')
plt.grid(True)

max_mem = max(mem)
max_idx = mem.index(max_mem)
plt.annotate(f'{max_mem:.2f} MB', (relative_cpu_time[max_idx], max_mem), textcoords="offset points", xytext=(0, 10), ha='center', fontsize=8)

plt.tight_layout()
plt.savefig(f'{output_dir}/memory.png')
plt.close()

# --- Gráfico: Throughput (agrupado por bloco de 5s)
df = pd.DataFrame({'relative_time': relative_times})
df['time_block'] = (df['relative_time']).astype(int)  # (df['relative_time'] // X).astype(int) * X
throughput_block = df.groupby('time_block').size()

plt.figure(figsize=(10, 4))
plt.plot(throughput_block.index, throughput_block.values, color='purple')
plt.title('Throughput')
plt.xlabel('Tempo (s)')
plt.ylabel('Requisições por Segundo')
plt.grid(True)

plt.tight_layout()
plt.savefig(f'{output_dir}/throughput.png')
plt.close()

print(f'Gráficos e estatísticas salvos em: {output_dir}')
