import Discovery from './discovery';
import { getChatGPTUser } from '../chatgpt-auth';
import { preferences } from '../../lib/beta-catalog';
export default async function Page() {
    const user = await getChatGPTUser();
    let initialTaste = null;
    if (user) {
        try { initialTaste = await preferences(user.userId); }
        catch { /* The client can retry without presenting returning users as new. */ }
    }
    return <Discovery initialTaste={initialTaste} initialSignedIn={!!user}/>;
}
