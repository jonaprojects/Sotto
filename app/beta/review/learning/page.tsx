import { owner } from '../../../../lib/beta-server';
import LearningReview from './review';
export default async function Page() { try {
    await owner();
    return <LearningReview />;
}
catch {
    return <main className="beta-document"><h1>Owner access required</h1><a href="/beta">Return to Sotto</a></main>;
} }
