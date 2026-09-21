import json
import os
import statistics
import matplotlib.pyplot as plt
import pandas as pd
import re
import shutil

RAW_DATA_DIR = 'data/raw'
PROCESSED_DIR = 'data/processed'
PROCESSED_RUNS_DIR = os.path.join(PROCESSED_DIR, 'runs')
PROCESSED_AGGREGATES_DIR = os.path.join(PROCESSED_DIR, 'aggregates')
PROCESSED_COMPARISONS_DIR = os.path.join(PROCESSED_DIR, 'comparisons')
REQUEST_RESULTS_FILE = 'request-results.json'
RESOURCE_USAGE_FILE = 'resource-usage.json'
SUMMARY_FILE = 'summary.json'
GLOBAL_SUMMARY_FILE = 'global_summary.json'
GLOBAL_REPORT_FILE = 'protocol-comparison-report.md'
COMPARISON_METRICS = {
	'avgLatencyMs': {
		'title': 'Latência Média',
		'ylabel': 'Latência (ms)',
		'filename': 'avg-latency-protocols.png',
		'color': 'orange'
	},
	'p50LatencyMs': {
		'title': 'P50 Latência',
		'ylabel': 'Latência (ms)',
		'filename': 'p50-latency-protocols.png',
		'color': 'green'
	},
	'p95LatencyMs': {
		'title': 'P95 Latência',
		'ylabel': 'Latência (ms)',
		'filename': 'p95-latency-protocols.png',
		'color': 'blue'
	},
	'p99LatencyMs': {
		'title': 'P99 Latência',
		'ylabel': 'Latência (ms)',
		'filename': 'p99-latency-protocols.png',
		'color': 'purple'
	},
	'avgThroughputReqPerSec': {
		'title': 'Throughput Médio',
		'ylabel': 'Requisições por segundo',
		'filename': 'throughput-protocols.png',
		'color': 'purple'
	},
	'avgCpuPercent': {
		'title': 'Uso Médio de CPU',
		'ylabel': 'CPU (%)',
		'filename': 'cpu-protocols.png',
		'color': 'blue'
	},
	'avgMemoryMB': {
		'title': 'Uso Médio de Memória',
		'ylabel': 'Memória (MB)',
		'filename': 'memory-protocols.png',
		'color': 'green'
	}
}

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


def load_all_run_summaries():
	summaries = {}

	scenarios = sorted(
		os.listdir(PROCESSED_AGGREGATES_DIR),
		key=scenario_sort_key
	)

	for scenario in scenarios:
		summary_path = os.path.join(
			PROCESSED_AGGREGATES_DIR,
			scenario,
			SUMMARY_FILE
		)

		if not os.path.exists(summary_path):
			continue

		summaries[scenario] = load_json(
			summary_path
		)

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

		if not runs:
			continue

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


def create_protocol_bar_graph(
	values,
	title,
	ylabel,
	output_path,
	color
):
	if not values:
		return

	sorted_items = sorted(values.items())

	protocols, metric_values = zip(*sorted_items)

	plt.figure(figsize=(10, 4))

	bars = plt.bar(
		protocols,
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
	plt.xlabel('Protocolo')
	plt.ylabel(ylabel)
	plt.grid(axis='y')
	plt.legend()

	plt.tight_layout()
	plt.savefig(output_path)
	plt.close()


def clean_comparison_outputs():
	if os.path.isdir(PROCESSED_COMPARISONS_DIR):
		shutil.rmtree(PROCESSED_COMPARISONS_DIR)

	os.makedirs(PROCESSED_COMPARISONS_DIR, exist_ok=True)


def create_scenario_protocol_comparisons(comparison_summary):
	for scenario, protocols in comparison_summary.items():
		output_dir = os.path.join(
			PROCESSED_COMPARISONS_DIR,
			'scenarios',
			scenario
		)

		os.makedirs(output_dir, exist_ok=True)

		for metric_name, metric_config in COMPARISON_METRICS.items():
			values = {}

			for protocol, metrics in protocols.items():
				if metric_name not in metrics:
					continue

				values[protocol] = metrics[metric_name]['mean']

			create_protocol_bar_graph(
				values,
				f"{metric_config['title']} por Protocolo - {scenario}",
				metric_config['ylabel'],
				os.path.join(
					output_dir,
					metric_config['filename']
				),
				metric_config['color']
			)


def create_run_protocol_comparisons(run_summaries):
	for scenario, protocols in run_summaries.items():
		runs = sorted({
			run
			for protocol_runs in protocols.values()
			for run in protocol_runs.keys()
		})

		for run in runs:
			output_dir = os.path.join(
				PROCESSED_COMPARISONS_DIR,
				'runs',
				scenario,
				run
			)

			os.makedirs(output_dir, exist_ok=True)

			for metric_name, metric_config in COMPARISON_METRICS.items():
				values = {}

				for protocol, protocol_runs in protocols.items():
					if run not in protocol_runs:
						continue

					values[protocol] = protocol_runs[run][metric_name]

				create_protocol_bar_graph(
					values,
					f"{metric_config['title']} por Protocolo - {scenario} / {run}",
					metric_config['ylabel'],
					os.path.join(
						output_dir,
						metric_config['filename']
					),
					metric_config['color']
				)


def calculate_overall_protocol_summary(run_summaries):
	metric_values_by_protocol = {}

	for protocols in run_summaries.values():
		for protocol, runs in protocols.items():
			if protocol not in metric_values_by_protocol:
				metric_values_by_protocol[protocol] = {
					metric_name: []
					for metric_name in COMPARISON_METRICS
				}

			for summary in runs.values():
				for metric_name in COMPARISON_METRICS:
					metric_values_by_protocol[protocol][metric_name].append(
						summary[metric_name]
					)

	overall_summary = {}

	for protocol, metrics in metric_values_by_protocol.items():
		overall_summary[protocol] = {}

		for metric_name, values in metrics.items():
			if not values:
				continue

			overall_summary[protocol][metric_name] = {
				'mean': round(statistics.mean(values), 2),
				'min': round(min(values), 2),
				'max': round(max(values), 2),
				'stdev': round(
					statistics.stdev(values), 2
				) if len(values) > 1 else 0
			}

	return overall_summary


def create_overall_protocol_comparisons(overall_summary):
	output_dir = os.path.join(
		PROCESSED_COMPARISONS_DIR,
		'global'
	)

	os.makedirs(output_dir, exist_ok=True)

	for metric_name, metric_config in COMPARISON_METRICS.items():
		values = {}

		for protocol, metrics in overall_summary.items():
			if metric_name not in metrics:
				continue

			values[protocol] = metrics[metric_name]['mean']

		create_protocol_bar_graph(
			values,
			f"{metric_config['title']} por Protocolo - Geral",
			metric_config['ylabel'],
			os.path.join(
				output_dir,
				metric_config['filename']
			),
			metric_config['color']
		)


def format_report_number(value, decimals=2):
	return f'{value:.{decimals}f}'


def calculate_request_totals(protocol_runs):
	total_requests = sum(
		run['totalRequests']
		for run in protocol_runs.values()
	)
	successful_requests = sum(
		run['successfulRequests']
		for run in protocol_runs.values()
	)
	failed_requests = sum(
		run['failedRequests']
		for run in protocol_runs.values()
	)
	success_rate = (
		successful_requests / total_requests * 100
		if total_requests else 0
	)

	return {
		'totalRequests': total_requests,
		'successfulRequests': successful_requests,
		'failedRequests': failed_requests,
		'successRate': success_rate
	}


def find_best_protocol(protocols, metric_name, higher_is_better=False):
	values = {
		protocol: metrics[metric_name]['mean']
		for protocol, metrics in protocols.items()
		if metric_name in metrics
	}

	if not values:
		return None

	selector = max if higher_is_better else min
	return selector(values, key=values.get)


def create_global_comparison_report(comparison_summary, run_summaries):
	output_dir = os.path.join(
		PROCESSED_COMPARISONS_DIR,
		'global'
	)
	os.makedirs(output_dir, exist_ok=True)

	winning_metrics = {
		'avgLatencyMs': ('latência média', False),
		'p95LatencyMs': ('latência p95', False),
		'p99LatencyMs': ('latência p99', False),
		'avgThroughputReqPerSec': ('throughput', True),
		'avgCpuPercent': ('CPU média', False),
		'avgMemoryMB': ('memória média', False)
	}
	wins = {}
	lines = [
		'# Relatório comparativo de protocolos',
		'',
		'Este relatório é gerado automaticamente a partir das execuções '
		'disponíveis em `data/raw`.',
		'',
		'Valores de latência menores são melhores; throughput maior é '
		'melhor. CPU e memória representam o custo do lado servidor e da '
		'infraestrutura obrigatória medida. No MQTT, isso inclui aplicação '
		'e broker.',
		'',
		'## Resumo por cenário',
		''
	]

	for scenario, protocols in comparison_summary.items():
		lines.extend([
			f'### {scenario}',
			'',
			'| Protocolo | Execuções | Sucesso | Latência média (ms) | '
			'p50 (ms) | p95 (ms) | p99 (ms) | Throughput (req/s) | '
			'CPU média (%) | Memória média (MB) |',
			'|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
		])

		for protocol in sorted(protocols):
			metrics = protocols[protocol]
			protocol_runs = run_summaries.get(scenario, {}).get(protocol, {})
			totals = calculate_request_totals(protocol_runs)
			lines.append(
				f'| {protocol} | {len(protocol_runs)} | '
				f"{format_report_number(totals['successRate'])}% "
				f"({totals['successfulRequests']}/{totals['totalRequests']}) | "
				f"{format_report_number(metrics['avgLatencyMs']['mean'])} | "
				f"{format_report_number(metrics['p50LatencyMs']['mean'])} | "
				f"{format_report_number(metrics['p95LatencyMs']['mean'])} | "
				f"{format_report_number(metrics['p99LatencyMs']['mean'])} | "
				f"{format_report_number(metrics['avgThroughputReqPerSec']['mean'])} | "
				f"{format_report_number(metrics['avgCpuPercent']['mean'])} | "
				f"{format_report_number(metrics['avgMemoryMB']['mean'])} |"
			)

		lines.extend(['', '**Destaques:**', ''])
		for metric_name, (label, higher_is_better) in winning_metrics.items():
			winner = find_best_protocol(
				protocols,
				metric_name,
				higher_is_better
			)
			if winner is None:
				continue

			wins[winner] = wins.get(winner, 0) + 1
			value = protocols[winner][metric_name]['mean']
			lines.append(
				f'- Melhor {label}: **{winner}** '
				f'({format_report_number(value)}).'
			)

		lines.append('')

	lines.extend([
		'## Contagem de destaques',
		'',
		'Esta contagem informa quantas vezes cada protocolo obteve o melhor '
		'valor nas métricas acima. Ela não constitui uma classificação geral, '
		'pois as métricas têm significados e prioridades diferentes.',
		'',
		'| Protocolo | Destaques |',
		'|---|---:|'
	])

	for protocol, count in sorted(
		wins.items(),
		key=lambda item: (-item[1], item[0])
	):
		lines.append(f'| {protocol} | {count} |')

	lines.extend([
		'',
		'## Notas para interpretação',
		'',
		'- Compare os protocolos prioritariamente dentro do mesmo cenário.',
		'- Médias globais entre cenários com cargas diferentes não representam '
		'um workload único e não devem definir sozinhas um vencedor.',
		'- Resultados com apenas uma execução não permitem avaliar a variação '
		'entre repetições.',
		'- CPU acima de 100% pode representar o uso de mais de um núcleo lógico.',
		'- O relatório descreve os resultados observados; diferenças de modelo '
		'de conexão e arquitetura devem ser consideradas na análise metodológica.',
		''
	])

	report_path = os.path.join(output_dir, GLOBAL_REPORT_FILE)
	with open(report_path, 'w') as report_file:
		report_file.write('\n'.join(lines))

	print(f'Relatório comparativo salvo em: {report_path}')


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

	clean_comparison_outputs()

	comparison_summary = (build_comparison_summary())

	save_comparison_summary(comparison_summary)

	run_summaries = load_all_run_summaries()

	create_scenario_protocol_comparisons(
		comparison_summary
	)

	create_run_protocol_comparisons(
		run_summaries
	)

	overall_summary = calculate_overall_protocol_summary(
		run_summaries
	)

	save_json(
		os.path.join(
			PROCESSED_COMPARISONS_DIR,
			'global-protocol-summary.json'
		),
		overall_summary
	)

	create_overall_protocol_comparisons(
		overall_summary
	)

	create_global_comparison_report(
		comparison_summary,
		run_summaries
	)


if __name__ == '__main__':
	main()
