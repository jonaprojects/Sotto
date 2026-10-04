import { approvedRecording, learning } from '../../../../../lib/beta-catalog';
import { fail, json, user } from '../../../../../lib/beta-server';
export async function GET(_request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    await user();
    const { id } = await params;
    await approvedRecording(id);
    const pack = await learning(id);
    return json(pack ? { mode: 'learning', package: pack } : { mode: 'listening-only', package: null });
}
catch (e) {
    return fail(e);
} }
