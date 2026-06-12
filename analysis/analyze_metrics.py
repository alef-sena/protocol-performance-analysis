import json
import os
import statistics
import matplotlib.pyplot as plt
import pandas as pd
import re

RAW_DATA_DIR = 'data/raw'
PROCESSED_DIR = 'data/processed'
PROCESSED_RUNS_DIR = os.path.join(PROCESSED_DIR, 'runs')
PROCESSED_AGGREGATES_DIR = os.path.join(PROCESSED_DIR, 'aggregates')
PROCESSED_COMPARISONS_DIR = os.path.join(PROCESSED_DIR, 'comparisons')
REQUEST_RESULTS_FILE = 'request-results.json'
RESOURCE_USAGE_FILE = 'resource-usage.json'
SUMMARY_FILE = 'summary.json'
GLOBAL_SUMMARY_FILE = 'global_summary.json'

os.makedirs(PROCESSED_RUNS_DIR, exist_ok=True)
os.makedirs(PROCESSED_AGGREGATES_DIR, exist_ok=True)
os.makedirs(PROCESSED_COMPARISONS_DIR, exist_ok=True)


def scenario_sort_key(scenario):
	match = re.match(
		r'(\d+)req-(\d+)kb-(\d+)conc',
		scenario
	)

	if not match:
		return (0, 0, 0)

	requests = int(match.group(1))
	payload = int(match.group(2))
	concurrency = int(match.group(3))

	return (
		requests,
		payload,
		concurrency
	)

def load_json(path):
	with open(path, 'r') as f:
		return json.load(f)


def save_json(path, data):
	with open(path, 'w') as f:
		json.dump(data, f, indent=2)


def load_all_global_summaries():
	summaries = {}

	scenarios = sorted(
		os.listdir(PROCESSED_AGGREGATES_DIR),
		key=scenario_sort_key
	)

	for scenario in scenarios:
		summary_path = os.path.join(
			PROCESSED_AGGREGATES_DIR,
			scenario,
			GLOBAL_SUMMARY_FILE
		)

		if not os.path.exists(summary_path):
			continue

		summaries[scenario] = load_json(
			summary_path
		)

	return summaries


def build_comparison_summary():
	summaries = load_all_global_summaries()

	return summaries


def save_comparison_summary(comparison_summary):
	save_json(
		os.path.join(
			PROCESSED_COMPARISONS_DIR,
			f'comparison-{SUMMARY_FILE}'
		),
		comparison_summary
	)


def calculate_summary(request_data, usage):

	cpu_values = [
		e['cpuPercent']
		for e in usage
	]

	memory_values = [
		e['memoryMB']
		for e in usage
	]

	return {
		'durationMs': request_data['totalExecutionTimeMs'],

		'totalRequests': request_data['totalRequests'],

		'successfulRequests': request_data['successfulRequests'],

		'failedRequests': request_data['failedRequests'],

		'avgLatencyMs': round(request_data['averageLatencyMs'], 2),

		'minLatencyMs': round(request_data['minLatencyMs'], 2),

		'maxLatencyMs': request_data['maxLatencyMs'],

		'p50LatencyMs': request_data['p50LatencyMs'],

		'p95LatencyMs': request_data['p95LatencyMs'],

		'p99LatencyMs': request_data['p99LatencyMs'],

		'avgThroughputReqPerSec': request_data['throughputReqPerSec'],

		'avgCpuPercent': round(
			statistics.mean(cpu_values), 2
		) if cpu_values else 0,

		'maxCpuPercent': round(
			max(cpu_values), 2
		) if cpu_values else 0,

		'avgMemoryMB': round(
			statistics.mean(memory_values), 2
		) if memory_values else 0,

		'maxMemoryMB': round(
			max(memory_values), 2
		) if memory_values else 0
	}


def calculate_global_summary(summary_data):
	global_summary = {}

	for protocol, runs in summary_data.items():

		# if not runs:
		# 	continue

		metrics = {
			'avgLatencyMs': [],
			'minLatencyMs': [],
			'maxLatencyMs': [],
			'p50LatencyMs': [],
			'p95LatencyMs': [],
			'p99LatencyMs': [],
			'avgThroughputReqPerSec': [],
			'avgCpuPercent': [],
			'maxCpuPercent': [],
			'avgMemoryMB': [],
			'maxMemoryMB': []
		}

		for summary in runs.values():
			for metric in metrics:
				metrics[metric].append(
					summary[metric]
				)

		global_summary[protocol] = {}

		for metric_name, values in metrics.items():

			global_summary[protocol][metric_name] = {
				'mean': round(statistics.mean(values), 2),
				'min': round(min(values), 2),
				'max': round(max(values), 2),
				'stdev': round(
					statistics.stdev(values), 2
				) if len(values) > 1 else 0
			}

	return global_summary


def create_latency_graph(results, output_path):

	latency_ms = [
		r['latencyMs']
		for r in results
	]

	request_ids = [r['request'] for r in results]

	n_points = 100

	block_size = max(
		1,
		len(results) // n_points
	)

	avg_request_ids = []
	avg_latencies = []

	for i in range(0, len(results), block_size):
		block_ids = request_ids[i:i + block_size]

		block_latencies = latency_ms[
			i:i + block_size
		]

		if block_ids and block_latencies:
			avg_request_ids.append(
				sum(block_ids) / len(block_ids)
			)

			avg_latencies.append(
				sum(block_latencies) / len(block_latencies)
			)

	plt.figure(figsize=(10, 4))

	plt.plot(
		avg_request_ids,
		avg_latencies,
		color='orange'
	)

	plt.title(
		f'Latência Média ({block_size} req/bloco)'
	)

	plt.xlabel('ID Médio do Bloco')
	plt.ylabel('Latência Média (ms)')
	plt.grid(True)

	plt.tight_layout()
	plt.savefig(output_path)
	plt.close()


def create_throughput_graph(results, output_path):
    start_times = [r['startTime'] for r in results]

    t0 = min(start_times)

    relative_times = [
        (t - t0) / 1000
        for t in start_times
    ]

    df = pd.DataFrame({
        'relative_time': relative_times
    })

    df['time_block'] = (
        df['relative_time']
        .astype(int)
    )

    throughput = (
        df.groupby('time_block')
        .size()
    )

    plt.figure(figsize=(10, 4))

    plt.plot(
        throughput.index,
        throughput.values,
        color='purple'
    )

    plt.title('Throughput')
    plt.xlabel('Tempo (s)')
    plt.ylabel('Requisições')
    plt.grid(True)

    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()


def create_cpu_graph(usage, output_path):
	timestamps = [
		e['timestamp']
		for e in usage
	]

	t0 = min(timestamps)

	relative_time = [
		(t - t0) / 1000
		for t in timestamps
	]

	cpu = [
		e['cpuPercent']
		for e in usage
	]

	plt.figure(figsize=(8, 4))

	plt.plot(
		relative_time,
		cpu,
		color='blue'
	)

	plt.title('Uso de CPU (100% = 1 núcleo lógico)')
	plt.xlabel('Tempo (s)')
	plt.ylabel('CPU (%)')
	plt.grid(True)

	if cpu:
		max_cpu = max(cpu)
		max_idx = cpu.index(max_cpu)

		plt.annotate(
			f'{max_cpu:.2f}%',
			(
				relative_time[max_idx],
				max_cpu
			),
			textcoords='offset points',
			xytext=(0, 10),
			ha='center',
			fontsize=8
		)

	plt.tight_layout()
	plt.savefig(output_path)
	plt.close()


def create_memory_graph(usage, output_path):
	timestamps = [
		e['timestamp']
		for e in usage
	]

	t0 = min(timestamps)

	relative_time = [
		(t - t0) / 1000
		for t in timestamps
	]

	memory = [
		e['memoryMB']
		for e in usage
	]

	plt.figure(figsize=(8, 4))

	plt.plot(
		relative_time,
		memory,
		color='green'
	)

	plt.title('Uso de Memória (MB)')
	plt.xlabel('Tempo (s)')
	plt.ylabel('Memória (MB)')
	plt.grid(True)

	if memory:
		max_mem = max(memory)
		max_idx = memory.index(max_mem)

		plt.annotate(
			f'{max_mem:.2f} MB',
			(
				relative_time[max_idx],
				max_mem
			),
			textcoords='offset points',
			xytext=(0, 10),
			ha='center',
			fontsize=8
		)

	plt.tight_layout()
	plt.savefig(output_path)
	plt.close()


def create_aggregate_graph(
	values,
	title,
	ylabel,
	output_path,
	color
):
	sorted_items = sorted(
		values.items(),
		key=lambda item: scenario_sort_key(item[0])
	)

	scenarios, metric_values = zip(*sorted_items)

	plt.figure(figsize=(10, 4))

	bars = plt.bar(
		scenarios,
		metric_values,
		color=color
	)

	for bar in bars:
		height = bar.get_height()

		plt.text(
			bar.get_x() + bar.get_width() / 2,
			height,
			f'{height:.2f}',
			ha='center',
			va='bottom',
			fontsize=8
		)

	avg = statistics.mean(metric_values)

	plt.axhline(
		y=avg,
		linestyle='--',
		label=f'Média: {avg:.2f}'
	)

	plt.title(title)
	plt.xlabel('Cenário')
	plt.ylabel(ylabel)

	plt.xticks(rotation=20, ha='right')

	plt.grid(axis='y')

	plt.legend()

	plt.tight_layout()
	plt.savefig(output_path)
	plt.close()


def create_metric_comparison_graph(
    comparison_summary,
    protocol,
    metric_name,
    title,
    ylabel,
    filename,
    color
):
	values = {}

	for scenario, protocols in comparison_summary.items():

		if protocol not in protocols:
			continue

		values[scenario] = (
			protocols[protocol]
			[metric_name]
			['mean']
		)

	create_aggregate_graph(
		values,
		title,
		ylabel,
		os.path.join(
			PROCESSED_COMPARISONS_DIR,
			filename
		),
		color
	)


def process_run(run_dir, output_dir):
	request_results_path = os.path.join(
		run_dir,
		REQUEST_RESULTS_FILE
	)

	resource_usage_path = os.path.join(
		run_dir,
		RESOURCE_USAGE_FILE
	)

	if not os.path.exists(request_results_path):
		print(f'Skipping {run_dir}: REQUEST_RESULTS_FILE não encontrado')
		return None

	if not os.path.exists(resource_usage_path):
		print(f'Skipping {run_dir}: RESOURCE_USAGE_FILE não encontrado')
		return None

	request_data = load_json(
		request_results_path
	)

	usage_data = load_json(
		resource_usage_path
	)

	results = request_data['results']

	os.makedirs(output_dir, exist_ok=True)

	create_latency_graph(
		results,
		os.path.join(
			output_dir,
			'latency.png'
		)
	)

	create_throughput_graph(
		results,
		os.path.join(
			output_dir,
			'throughput.png'
		)
	)

	create_cpu_graph(
		usage_data,
		os.path.join(
			output_dir,
			'cpu.png'
		)
	)

	create_memory_graph(
		usage_data,
		os.path.join(
			output_dir,
			'memory.png'
		)
	)

	summary = calculate_summary(
		request_data,
		usage_data
	)

	print(f'Gráficos gerados em: {output_dir}')

	return summary


def process_scenario(scenario):
	scenario_path = os.path.join(
		RAW_DATA_DIR,
		scenario
	)

	scenario_runs_dir = os.path.join(
		PROCESSED_RUNS_DIR,
		scenario
	)

	aggregate_dir = os.path.join(
		PROCESSED_AGGREGATES_DIR,
		scenario
	)

	os.makedirs(aggregate_dir, exist_ok=True)

	summary_data = {}

	runs = sorted(os.listdir(scenario_path))

	for run in runs:
		run_path = os.path.join(
			scenario_path,
			run
		)

		protocols = sorted(
			os.listdir(run_path)
		)

		for protocol in protocols:

			protocol_path = os.path.join(
				run_path,
				protocol
			)

			if not os.path.isdir(protocol_path):
				continue

			output_dir = os.path.join(
				scenario_runs_dir,
				run,
				protocol
			)

			summary = process_run(
				protocol_path,
				output_dir
			)

			if protocol not in summary_data:
				summary_data[protocol] = {}

			if summary:
				summary_data[protocol][run] = summary

	summary_output_path = os.path.join(
		aggregate_dir,
		SUMMARY_FILE
	)

	save_json(
		summary_output_path,
		summary_data
	)

	global_summary = calculate_global_summary(
		summary_data
	)

	global_summary_output_path = os.path.join(
		aggregate_dir,
		GLOBAL_SUMMARY_FILE
	)

	save_json(
		global_summary_output_path,
		global_summary
	)

	print(f'Summary salvo em: {summary_output_path}')

	print(
		f'Global summary salvo em: '
		f'{global_summary_output_path}'
	)


def main():
	scenarios = sorted(
		os.listdir(RAW_DATA_DIR),
		key=scenario_sort_key
	)

	for scenario in scenarios:
		scenario_path = os.path.join(
			RAW_DATA_DIR,
			scenario
		)

		if not os.path.isdir(scenario_path):
			continue

		process_scenario(scenario)

	comparison_summary = (build_comparison_summary())

	save_comparison_summary(comparison_summary)

	available_protocols = set()

	for scenario in comparison_summary.values():
		available_protocols.update(
			scenario.keys()
		)

	for protocol in sorted(available_protocols):

		create_metric_comparison_graph(
			comparison_summary,
			protocol,
			'avgLatencyMs',
			f'Latência Média (1000 req/bloco)',
			'Latência (ms)',
			f'latency-comparison-{protocol}.png',
			'orange'
		)

		create_metric_comparison_graph(
			comparison_summary,
			protocol,
			'avgThroughputReqPerSec',
			f'Throughput (req/s)',
			'Requisições',
			f'throughput-comparison-{protocol}.png',
			'purple'
		)

		create_metric_comparison_graph(
			comparison_summary,
			protocol,
			'avgCpuPercent',
			f'Uso de CPU (100% = 1 núcleo lógico)',
			'CPU (%)',
			f'cpu-comparison-{protocol}.png',
			'blue'
		)

		create_metric_comparison_graph(
			comparison_summary,
			protocol,
			'avgMemoryMB',
			f'Uso de Memória (MB)',
			'Memória (MB)',
			f'memory-comparison-{protocol}.png',
			'green'
		)

		create_metric_comparison_graph(
			comparison_summary,
			protocol,
			'p50LatencyMs',
			f'P50 Latência ({protocol})',
			'Latência (ms)',
			f'p50-comparison-{protocol}.png',
			'green'
		)

		create_metric_comparison_graph(
			comparison_summary,
			protocol,
			'p95LatencyMs',
			f'P95 Latência ({protocol})',
			'Latência (ms)',
			f'p95-comparison-{protocol}.png',
			'blue'
		)

		create_metric_comparison_graph(
			comparison_summary,
			protocol,
			'p99LatencyMs',
			f'P99 Latência ({protocol})',
			'Latência (ms)',
			f'p99-comparison-{protocol}.png',
			'purple'
		)


if __name__ == '__main__':
	main()
