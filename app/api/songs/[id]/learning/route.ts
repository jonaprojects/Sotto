import { approvedRecording, learning } from '../../../../../lib/beta-catalog';
import { config, fail, json, user } from '../../../../../lib/beta-server';
import { providerLyrics } from '../../../../../lib/lrclib-server';
import { translatePackage } from '../../../../../lib/translation';
import { wordTokens } from '../../../../../lib/learning-words';
export async function GET(_request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    await user();
    const { id } = await params;
    await approvedRecording(id);
    const approved = await learning(id);
    let pack = approved || await providerLyrics(id);
    // This localhost-only provider is explicitly configured in local development.
    const endpoint = config().LOCAL_TRANSLATION_URL;
    if (pack && endpoint && new URL(_request.url).hostname === '127.0.0.1') pack = await translatePackage(pack, endpoint);
    if (pack) pack = await wordTokens(pack);
    return json(pack ? { mode: approved ? 'learning' : 'lyrics', package: pack } : { mode: 'listening-only', package: null });
}
catch (e) {
    return fail(e);
} }
