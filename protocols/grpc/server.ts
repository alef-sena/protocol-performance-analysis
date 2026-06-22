import path from 'path';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.resolve(
	__dirname,
	'proto',
	'message.proto'
);

const packageDefinition = protoLoader.loadSync(
	PROTO_PATH,
	{
		keepCase: true,
		longs: String,
		enums: String,
		defaults: true,
		oneofs: true
	}
);

const proto = grpc.loadPackageDefinition(
	packageDefinition
) as any;

function sendMessage(
	call: grpc.ServerUnaryCall<any, any>,
	callback: grpc.sendUnaryData<any>
) {
	callback(
		null,
		{
			id: call.request.id,
			message: call.request.message,
			timestamp: Date.now(),
		}
	);
}

const server = new grpc.Server();

server.addService(
	proto.benchmark.BenchmarkService.service,
	{
		SendMessage: sendMessage
	}
);

const PORT = process.env.PORT || '50051';

server.bindAsync(
	`0.0.0.0:${PORT}`,
	grpc.ServerCredentials.createInsecure(),
	(error, port) => {

		if (error) {
			console.error(error);
			process.exit(1);
		}

		server.start();

		console.log(
			`gRPC Server rodando na porta ${port}`
		);
	}
);
