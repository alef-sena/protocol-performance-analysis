import { spawn, spawnSync, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import Docker from 'dockerode';

const RAW_DATA_DIR = path.resolve('data/raw/http');
const docker = new Docker();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function collectContainerStats(containerName: string, intervalMs: number, collectingFlag: () => boolean): Promise<any[]> {
  const stats = [];
  const container = docker.getContainer(containerName);

  while (collectingFlag()) {
    const stat = await container.stats({ stream: false });
    const cpuDelta = stat.cpu_stats.cpu_usage.total_usage - stat.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stat.cpu_stats.system_cpu_usage - stat.precpu_stats.system_cpu_usage;
    const cpu = (systemDelta > 0 && cpuDelta > 0) ? (cpuDelta / systemDelta) * stat.cpu_stats.online_cpus : 0;

    const memoryMB = stat.memory_stats.usage / 1024 / 1024;
    stats.push({ timestamp: Date.now(), cpu, memoryMB });

    await sleep(intervalMs);
  }

  return stats;
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
    execSync('python3 analysis/analyze_http_metrics.py', { stdio: 'inherit' });
  } catch (err) {
    console.error('Erro ao executar script de análise:', err);
  }
}

function runClientScript(requests: number, payloadKB: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      TOTAL_REQUESTS: String(requests),
      PAYLOAD_KB: String(payloadKB),
      TARGET: 'localhost:3000',
    };

    const child = spawn('npx', ['ts-node', 'protocols/http/client.ts'], {
      env,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Client saiu com código ${code}`));
    });
  });
}

async function orchestrate() {
  const workloadPath = path.resolve(__dirname, '../config/http-workload.json');
  const workloadConfig = JSON.parse(fs.readFileSync(workloadPath, 'utf-8'));

  for (const config of workloadConfig) {
    const { requests, payloadKB } = config;

    try {
      await runDockerComposeUp();
      await waitForContainerRunning('http-server', 10000);
      await waitForServerHealth('http://localhost:3000/health', 20000);

      console.log(`Executando teste: [${requests} requisições, ${payloadKB} KB]. Aguarde...`);

      let collecting = true;
      const collectingFlag = () => collecting;

      const statsPromise = collectContainerStats('http-server', 1000, collectingFlag);

      await runClientScript(requests, payloadKB);
      collecting = false;

      const metrics = await statsPromise;

      const resourcesFilename = `resource-usage/${requests}req-${payloadKB}kb.json`;
      const resourcePath = path.join(RAW_DATA_DIR, resourcesFilename);

      if (!fs.existsSync(path.dirname(resourcePath))) fs.mkdirSync(path.dirname(resourcePath), { recursive: true });

      fs.writeFileSync(resourcePath, JSON.stringify(metrics, null, 2));
      console.log(`Métricas de uso de recursos salvas em ${resourcePath}`);
    } catch (err) {
      console.error('Erro durante o teste:', err);
    } finally {
      cleanupDocker();
    }
  }

  runPythonAnalysis();
  console.log('\nTodas as análises foram concluídas.');
}

orchestrate();
