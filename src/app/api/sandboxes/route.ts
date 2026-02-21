import { NextResponse } from 'next/server';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Need to instruct Next.js to not bundle this statically since Grpc uses C++ addons
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const PROTO_PATH = path.join(process.cwd(), 'crates/crucible-daemon/proto/crucible.proto');

        const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
            includeDirs: [path.join(process.cwd(), 'crates/crucible-daemon/proto')],
        });

        const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
        const crucible = protoDescriptor.crucible.daemon.v1;

        // Connect to the local crucible-daemon instance
        const client = new crucible.Sandboxes(
            'localhost:7171',
            grpc.credentials.createInsecure()
        );

        return new Promise((resolve) => {
            client.ListSandboxes({}, (err: any, response: any) => {
                if (err) {
                    console.error("gRPC Error:", err);
                    return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
                }
                resolve(NextResponse.json(response));
            });
        });
    } catch (error: any) {
        console.error("Proxy Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
