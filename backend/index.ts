import { router, json, error, secrets } from '@appdeploy/sdk';

import { notifySubscribers, realtimeSubscriptionRoutes } from './realtime-subscribers';
import { createMemberAuth } from './matrix-member-auth';
import { createMemberOnlineRpc, createMemberOnlineService } from './member-online';
import { createMemberProfileStore } from './member-profile-store';
import { createMemberProfileRoutes } from './member-profile-routes';
import { createMemberNotificationStore } from './member-notification-store';
import { createMemberNotificationRoutes } from './member-notification-routes';
import { createMemberBootstrap } from './member-bootstrap';
import { createMemberBootstrapRoutes } from './member-bootstrap-routes';
import { createMemberRouteHandlers } from './member-route-handlers';

async function loadMatrixSupabaseConfig() {
    const names = await secrets.listSecretNames();
    const required = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
    if (!required.every(name => names.includes(name))) throw new Error('SUPABASE_CONFIG_MISSING');
    const [url,anonKey,serviceRoleKey] = await Promise.all(required.map(name => secrets.readSecret(name)));
    if (!url?.trim() || !anonKey?.trim() || !serviceRoleKey?.trim()) throw new Error('SUPABASE_CONFIG_MISSING');
    return { url:url.trim().replace(/\/+$/,''),anonKey:anonKey.trim(),serviceRoleKey:serviceRoleKey.trim() };
}

const matrixMemberAuth = createMemberAuth(loadMatrixSupabaseConfig);
const memberOnlineService = createMemberOnlineService(createMemberOnlineRpc(loadMatrixSupabaseConfig));
const memberProfileStore = createMemberProfileStore(loadMatrixSupabaseConfig);
const memberProfileRoutes = createMemberProfileRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    readProfile: memberId => memberProfileStore.read(memberId),
});
const memberNotificationStore = createMemberNotificationStore(loadMatrixSupabaseConfig);
const memberNotificationRoutes = createMemberNotificationRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    store: memberNotificationStore,
});
const memberBootstrap = createMemberBootstrap(loadMatrixSupabaseConfig);
const memberBootstrapRoutes = createMemberBootstrapRoutes({
    bootstrap: authorization => memberBootstrap.bootstrap(authorization),
});
function authorizationHeader(event: { headers?: Record<string,string|undefined> } | undefined) {
    return event?.headers?.authorization ?? event?.headers?.Authorization;
}
const memberRouteHandlers = createMemberRouteHandlers({
    bootstrapPost: input => memberBootstrapRoutes.post(input),
    profileGet: input => memberProfileRoutes.get(input),
    notificationGet: input => memberNotificationRoutes.get(input),
    notificationSave: input => memberNotificationRoutes.save(input),
    authorizationHeader,
    json,
});
export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
    ...memberRouteHandlers,
    'POST /api/member-online/start': [async ({ event }) => {
        try {
            const member=await matrixMemberAuth.requireMember(authorizationHeader(event));
            return json(await memberOnlineService.start(member.memberId));
        } catch (e) {
            const value=e as { code?:string;status?:number;message?:string };
            return error(value.code ?? value.message ?? 'MEMBER_ONLINE_START_FAILED',value.status ?? 500);
        }
    }],
    'POST /api/member-online/end': [async ({ body,event }) => {
        try {
            const member=await matrixMemberAuth.requireMember(authorizationHeader(event));
            const sessionId=String((body as {sessionId?:unknown})?.sessionId ?? '');
            if(!sessionId) return error('MEMBER_ONLINE_SESSION_REQUIRED',400);
            return json(await memberOnlineService.end(member.memberId,sessionId));
        } catch (e) {
            const value=e as { code?:string;status?:number;message?:string };
            return error(value.code ?? value.message ?? 'MEMBER_ONLINE_END_FAILED',value.status ?? 500);
        }
    }],
    ...realtimeSubscriptionRoutes,
});

export { notifySubscribers };
