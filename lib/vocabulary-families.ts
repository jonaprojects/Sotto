import {db} from './beta-server';
export async function familiesFor(userId:string) {
    const families=await db().prepare('SELECT id,name FROM vocabulary_families WHERE user_id=? ORDER BY created_at').bind(userId).all<{id:string;name:string}>();
    const memberships=await db().prepare('SELECT word_id AS wordId,family_id AS familyId FROM vocabulary_memberships WHERE user_id=?').bind(userId).all<{wordId:string;familyId:string}>();
    return {families:[{id:'favorites',name:'Favorites'},...families.results],memberships:memberships.results};
}
