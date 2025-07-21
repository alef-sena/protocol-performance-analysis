import { spawn, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';

const RAW_DATA_DIR = path.resolve('data/raw');
const OUTPUT_STATS_FILE = path.join(RAW_DATA_DIR, 'http-resource-usage.json');

const containerNames = [
  'http-server',
  'http-client',
];

const stats: any[] = [];
let statsInterval: NodeJS.Timeout;

function parseDockerStats(output: string) {
  const lines = output.trim().split('\n');
  const found = [];

  lines.forEach((line) => {
    const [name, cpu, memUsage] = line.split(/\s{2,}/);
    if (containerNames.includes(name)) {
      stats.push({
        timestamp: Date.now(),
        container: name,
        cpu: parseFloat(cpu.replace('%', '')),
        memoryMB: parseFloat(memUsage.split('/')[0].replace(/[^0-9.]/g, '')),
      });
      found.push(name);
    }
  });

  if (found.length === 0) {
    console.warn('Nenhum container relevante encontrado pelo docker stats.');
  }
}

function startStatsCollection() {
  console.log('Iniciando coleta de métricas...');
  statsInterval = setInterval(() => {
    try {
      const output = execSync(
        'docker stats --no-stream --format "{{.Name}}  {{.CPUPerc}}  {{.MemUsage}}"',
      ).toString();
      parseDockerStats(output);
    } catch (err) {
      console.error('Erro ao coletar docker stats:', err);
    }
  }, 500);
}

function stopStatsCollection() {
  clearInterval(statsInterval);

  if (!fs.existsSync(RAW_DATA_DIR)) fs.mkdirSync(RAW_DATA_DIR, { recursive: true });

  if (stats.length === 0) {
    console.error('Nenhuma métrica foi coletada. Verifique se os containers estão corretos.');
  }

  fs.writeFileSync(OUTPUT_STATS_FILE, JSON.stringify(stats, null, 2));
  console.log(`Métricas salvas em ${OUTPUT_STATS_FILE}`);
}

function runDockerComposeUp(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Subindo servidor...');
    const up = spawn('docker', ['compose', 'up', '-d', 'http-server'], { stdio: 'inherit' });

    up.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose up terminou com código ${code}`));
    });
  });
}

function waitForServerReady(url: string, timeoutMs = 10000): Promise<void> {
  console.log('Aguardando servidor responder...');
  return new Promise((resolve, reject) => {
		const start = Date.now();

		const check = () => {
			http.get(url, (res) => {
				if (res.statusCode === 200) {
					resolve();
				} else {
					retry();
				}
			}).on('error', retry);
		};

		const retry = () => {
			if (Date.now() - start > timeoutMs) {
				reject(new Error('⛔ Tempo limite ao aguardar o servidor.'));
			} else {
				setTimeout(check, 500);
			}
		};

		check();
	});
}

function runClient(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Executando client...');
    const client = spawn('docker', ['compose', 'run', '--rm', 'http-client'], { stdio: 'inherit' });

    client.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`http-client terminou com código ${code}`));
    });
  });
}

function runPythonAnalysis(): void {
  console.log('Executando análise de métricas...');
  try {
    execSync('python3 analysis/analyze_http_metrics.py', { stdio: 'inherit' });
  } catch (err) {
    console.error('Erro ao executar script de análise:', err);
  }
}

function cleanupDocker() {
  console.log('Limpando containers...');
  try {
    execSync('docker compose down --remove-orphans', { stdio: 'inherit' });
    console.log('Containers removidos.');
  } catch (err) {
    console.error('Erro ao remover containers:', err);
  }
}

async function orchestrate() {
  try {
    await runDockerComposeUp();

    await waitForServerReady('http://localhost:3000/health', 120000);

    startStatsCollection();

    await runClient();

    stopStatsCollection();

    runPythonAnalysis();

    console.log('Análise concluída com sucesso.');
  } catch (err) {
    console.error('Erro durante a orquestração:', err);
  } finally {
    cleanupDocker();
  }
}

orchestrate();
