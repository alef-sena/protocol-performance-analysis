import { spawn, spawnSync, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import Docker from 'dockerode';

const PROTOCOLS: Protocol[] = [
	// 'http',
	'websocket',
];
const PROTOCOL_CONFIG = {
	http: {
		serverContainerName: 'http-server',
		clientContainerName: 'http-client',
		clientScript: 'protocols/http/client.ts',
		target: 'http-server:3000',
		healthUrl: 'http://localhost:3000/health',
	},

	websocket: {
		serverContainerName: 'websocket-server',
		clientContainerName: 'websocket-client',
		clientScript: 'protocols/websocket/client.ts',
		target: 'ws://websocket-server:3000',
		healthUrl: 'http://localhost:3000/health',
	},
} as const;
type Protocol = keyof typeof PROTOCOL_CONFIG;
const RAW_DATA_DIR = path.resolve('data/raw');
// const docker = new Docker();

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function collectContainerStats(
	containerName: string,
	intervalMs: number,
	collectingFlag: () => boolean
): Promise<any[]> {
	const stats: {
		timestamp: number;
		cpuPercent: number;
		memoryMB: number;
	}[] = [];

	while (collectingFlag()) {
		try {
			const output = execSync(
				`docker stats --no-stream --format "{{.CPUPerc}};{{.MemUsage}}" ${containerName}`
			)
				.toString()
				.trim();

			const [cpuText, memoryText] = output.split(';');

			const cpuPercent = parseFloat(
				cpuText.replace('%', '').replace(',', '.')
			);

			const memoryUsed = memoryText.split('/')[0].trim();

			let memoryMB = 0;

			if (memoryUsed.endsWith('MiB')) {
				memoryMB = parseFloat(memoryUsed.replace('MiB', ''));
			} else if (memoryUsed.endsWith('GiB')) {
				memoryMB =
					parseFloat(memoryUsed.replace('GiB', '')) * 1024;
			} else if (memoryUsed.endsWith('KiB')) {
				memoryMB =
					parseFloat(memoryUsed.replace('KiB', '')) / 1024;
			} else if (memoryUsed.endsWith('B')) {
				memoryMB =
					parseFloat(memoryUsed.replace('B', '')) /
					1024 /
					1024;
			}

			stats.push({
				timestamp: Date.now(),
				cpuPercent,
				memoryMB,
			});
		} catch (error) {
			console.error(
				`Erro ao coletar métricas do container ${containerName}:`,
				error
			);
		}

		await sleep(intervalMs);
	}

	return stats;
}

function runDockerComposeUp(protocol: Protocol): Promise<void> {
	return new Promise((resolve, reject) => {
		console.log(`Subindo servidor ${PROTOCOL_CONFIG[protocol].serverContainerName}...`);
		const up = spawn(
			'docker',
			[
				'compose',
				'up',
				'-d',
				PROTOCOL_CONFIG[protocol].serverContainerName,
				PROTOCOL_CONFIG[protocol].clientContainerName
			],
			{ stdio: 'inherit' }
		);

		up.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`docker compose up terminou com código ${code}`));
		});
	});
}

function waitForContainerRunning(containerName: string, timeoutMs = 10000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const interval = setInterval(() => {
			const status = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', containerName]);
			const isRunning = status.stdout.toString().trim() === 'true';

			if (isRunning) {
				clearInterval(interval);
				resolve();
			} else if (Date.now() - start > timeoutMs) {
				clearInterval(interval);
				reject(new Error(`Timeout: ${containerName} não ficou pronto`));
			}
		}, 500);
	});
}

function waitForServerHealth(url: string, timeoutMs = 10000): Promise<void> {
	console.log('Aguardando servidor responder...');
	return new Promise((resolve, reject) => {
		const start = Date.now();

		const check = () => {
			http.get(url, (res) => {
				if (res.statusCode === 200) {
					console.log('Servidor OK');
					resolve();
				} else {
					retry();
				}
			}).on('error', retry);
		};

		const retry = () => {
			if (Date.now() - start > timeoutMs) {
				reject(new Error('Tempo limite ao aguardar o servidor.'));
			} else {
				setTimeout(check, 500);
			}
		};

		check();
	});
}

function cleanupDocker() {
	console.log('Limpando containers...\n');
	try {
		execSync('docker compose down --remove-orphans', { stdio: 'inherit' });
		console.log('Containers removidos\n');
	} catch (err) {
		console.error('Erro ao remover containers:', err);
	}
}

function runPythonAnalysis(): void {
	console.log('Todos os testes concluídos. Executando análise de métricas...');
	try {
		execSync('python3 analysis/analyze_metrics.py', { stdio: 'inherit' });
	} catch (err) {
		console.error('Erro ao executar script de análise:', err);
	}
}

function runClientContainer(
	requests: number,
	payloadKB: number,
	concurrency: number,
	requestTimeoutMs: number,
	requestResultsPathContainer: string,
	protocol: Protocol
): Promise<void> {
	return new Promise((resolve, reject) => {

		const child = spawn(
			'docker',
			[
				'exec',
				'-e',
				`TOTAL_REQUESTS=${requests}`,
				'-e',
				`PAYLOAD_KB=${payloadKB}`,
				`-e`,
				`CONCURRENCY=${concurrency}`,
				`-e`,
				`REQUEST_TIMEOUT_MS=${requestTimeoutMs}`,
				'-e',
				`TARGET=${PROTOCOL_CONFIG[protocol].target}`,
				'-e',
				`OUTPUT_PATH=${requestResultsPathContainer}`,
				PROTOCOL_CONFIG[protocol].clientContainerName,
				'npx',
				'ts-node',
				PROTOCOL_CONFIG[protocol].clientScript
			],
			{
				stdio: 'inherit'
			}
		);

		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`Client container saiu com código ${code}`
					)
				);
			}
		});
	});
}

async function orchestrate() {
	const settingsPath = path.resolve(__dirname,'../config/test-settings.json');

	const testSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

	const repetitions = testSettings.repetitions || 1;

	const resourceCollectionIntervalMs = testSettings.resourceCollectionIntervalMs || 1000;

	const waitAfterStartupMs = testSettings.waitAfterStartupMs || 0;

	const requestTimeoutMs = testSettings.requestTimeoutMs || 5000;

	const workloadPath = path.resolve(__dirname,'../config/workload.json');

	const workloadConfig = JSON.parse(fs.readFileSync(workloadPath, 'utf-8'));

	console.log('\nCargas de trabalho identificadas:\n');

	workloadConfig.forEach(
		(
			workload: {
				requests: number;
				payloadKB: number;
				concurrency: number;
			},
			index: number
		) => {
			console.log(
				`${index + 1}. ` +
				`${workload.requests} req | ` +
				`${workload.payloadKB} KB | ` +
				`concorrência ${workload.concurrency}`
			);
		}
	);

	console.log('');

	for (const workload of workloadConfig) {
		const {
			requests,
			payloadKB,
			concurrency = 1
		} = workload;

		for (let run = 1; run <= repetitions; run++) {

			for (const protocol of PROTOCOLS) {
				const scenarioName = `${requests}req-${payloadKB}kb-${concurrency}conc`;
				const runName = `run-${run}`;
				const scenarioDir = path.join(RAW_DATA_DIR,scenarioName,runName,protocol);

				const requestResultsPathHost = path.join(
					scenarioDir,
					'request-results.json'
				);

				const requestResultsPathContainer = requestResultsPathHost.replace(
					path.resolve('data'),
					'/app/data'
				);

				const resourceUsagePath = path.join(scenarioDir,'resource-usage.json');

				try {
					console.log(`\n[RUN ${run}/${repetitions}] ${scenarioName}`);

					fs.mkdirSync(scenarioDir, {recursive: true,});

					await runDockerComposeUp(protocol);
					await waitForContainerRunning(PROTOCOL_CONFIG[protocol].serverContainerName, 10000);
					await waitForContainerRunning(PROTOCOL_CONFIG[protocol].clientContainerName, 10000);

					const healthUrl = PROTOCOL_CONFIG[protocol].healthUrl;

					if (healthUrl) {
						await waitForServerHealth(healthUrl,20000);
					}

					if (waitAfterStartupMs > 0) {
						console.log(`Aguardando ${waitAfterStartupMs}ms antes do início do teste...`);
						await sleep(waitAfterStartupMs);
					}

					console.log(`Executando teste: [${requests} requisições, ${payloadKB} KB, concorrência ${concurrency}]. Aguarde...`);

					let collecting = true;
					const collectingFlag = () => collecting;
					const statsPromise = collectContainerStats(PROTOCOL_CONFIG[protocol].serverContainerName, resourceCollectionIntervalMs, collectingFlag);

					await runClientContainer(requests, payloadKB, concurrency, requestTimeoutMs, requestResultsPathContainer, protocol);

					console.log(`Teste: [${requests} requisições, ${payloadKB} KB] finalizado!`);

					collecting = false;

					const metrics = await statsPromise;

					fs.writeFileSync(resourceUsagePath,JSON.stringify(metrics, null, 2));

					console.log(`Uso de recursos computacionais salvo em ${resourceUsagePath}`);

				} catch (err) {
					console.error(`Erro durante ${runName}:`,err);
				} finally {
					cleanupDocker();
				}
			}
		}
	}

	runPythonAnalysis();

	console.log('\nTodas as análises foram concluídas.');
}

orchestrate();
