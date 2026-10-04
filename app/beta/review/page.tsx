import { owner } from '../../../lib/beta-server';
import Review from './review';
export default async function Page() { try {
    await owner();
    return <Review />;
}
catch {
    return <main className="beta-document"><h1>Catalog review</h1><p>This page is restricted to the configured catalog owner.</p><a href="/beta">Return to Sotto</a></main>;
} }
