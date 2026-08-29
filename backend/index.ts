import { router, json, error, secrets } from '@appdeploy/sdk';

import { notifySubscribers, realtimeSubscriptionRoutes } from './realtime-subscribers';
import { analysisStore } from './matrix-analysis-store';
import { createMemberAuth } from './matrix-member-auth';
import { createMatrixTianyanRoutes } from './matrix-tianyan-routes';
import type { TianyanArtifact } from './matrix-tianyan-service';
import { createMatrixTiangongRoutes } from './matrix-tiangong-routes';
import type { TiangongArtifact } from './matrix-tiangong-service';
import { createCustomStatusStore } from './matrix-custom-status-store';
import { createMatrixCustomStatusRoutes } from './matrix-custom-status-routes';
import { createMatrixStatusRoutes } from './matrix-status-routes';
import type { ExploreArtifact, TianyanArtifact as StatusTianyanArtifact } from './matrix-status-service';
import { readReadyAnalysis } from './matrix-ready-analysis';
import { readStoredStatusExplore } from './matrix-status-analysis-reader';
import { createMemberOnlineRpc, createMemberOnlineService } from './member-online';
import { createMemberProfileStore } from './member-profile-store';
import { createMemberProfileRoutes } from './member-profile-routes';
import { createMemberNotificationStore } from './member-notification-store';
import { createMemberNotificationRoutes } from './member-notification-routes';
import { createMemberBootstrap } from './member-bootstrap';
import { createMemberBootstrapRoutes } from './member-bootstrap-routes';
import { createMemberRouteHandlers } from './member-route-handlers';
import { createLineLogout, LineLogoutError } from './line-logout';
import { createLineLogoutRoutes } from './line-logout-routes';
import { createLineAuthRouteHandlers } from './line-auth-route-handlers';

async function loadMatrixSupabaseConfig() {
    const names = await secrets.listSecretNames();
    const required = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
    if (!required.every(name => names.includes(name))) throw new Error('SUPABASE_CONFIG_MISSING');
    const [url,anonKey,serviceRoleKey] = await Promise.all(required.map(name => secrets.readSecret(name)));
    if (!url?.trim() || !anonKey?.trim() || !serviceRoleKey?.trim()) throw new Error('SUPABASE_CONFIG_MISSING');
    return { url:url.trim().replace(/\/+$/,''),anonKey:anonKey.trim(),serviceRoleKey:serviceRoleKey.trim() };
}

async function loadLineLoginConfig() {
    const names = await secrets.listSecretNames();
    if (!names.includes('LINE_CHANNEL_ID') || !names.includes('LINE_CHANNEL_SECRET')) {
        throw new LineLogoutError('LINE_LOGIN_NOT_CONFIGURED', 503);
    }
    const [channelId, channelSecret] = await Promise.all([
        secrets.readSecret('LINE_CHANNEL_ID'),
        secrets.readSecret('LINE_CHANNEL_SECRET'),
    ]);
    if (!channelId?.trim() || !channelSecret?.trim()) {
        throw new LineLogoutError('LINE_LOGIN_NOT_CONFIGURED', 503);
    }
    return { channelId: channelId.trim(), channelSecret: channelSecret.trim() };
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
const matrixCustomStatusStore = createCustomStatusStore(loadMatrixSupabaseConfig);
const matrixCustomStatusRoutes = createMatrixCustomStatusRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    store: matrixCustomStatusStore,
});
const readCompletedMatrixAnalysis = (
    kind: 'tianyan'|'tiangong',
    lottery: '今彩539'|'天天樂'|'六合彩'|'大樂透',
    drawPeriod?: string,
) => readReadyAnalysis(
    (analysisKind,analysisLottery,analysisPeriod,analysisVersion) => analysisStore.readAnalysis(analysisKind,analysisLottery,analysisPeriod,analysisVersion),
    kind,
    lottery,
    drawPeriod,
);
async function readStatusAnalysis(
    kind: 'explore'|'tianyan'|'tiangong'|'status',
    lottery: '今彩539'|'天天樂'|'六合彩'|'大樂透',
    drawPeriod?: string,
) {
    if (kind === 'explore') {
        return readStoredStatusExplore(
            (analysisKind,analysisLottery,analysisPeriod) => analysisStore.readAnalysis(analysisKind,analysisLottery,analysisPeriod),
            lottery,
            drawPeriod,
        );
    }
    return kind === 'tianyan'
        ? readCompletedMatrixAnalysis(kind,lottery,drawPeriod)
        : analysisStore.readAnalysis(kind,lottery,drawPeriod);
}
const matrixStatusRoutes = createMatrixStatusRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    readStatusSources: async (lottery,drawPeriod) => {
        const explore=await readStatusAnalysis('explore',lottery,drawPeriod);
        if (!explore) return null;
        const tianyan=await readStatusAnalysis('tianyan',lottery,explore.drawPeriod);
        if (!tianyan || tianyan.analysisVersion!==explore.analysisVersion || tianyan.drawPeriod!==explore.drawPeriod) return null;
        return {
            analysisVersion:explore.analysisVersion,
            drawPeriod:explore.drawPeriod,
            explore:explore.data as ExploreArtifact,
            tianyan:tianyan.data as StatusTianyanArtifact,
        };
    },
    listConfigs: memberId => matrixCustomStatusStore.list(memberId),
});
const matrixTianyanRoutes = createMatrixTianyanRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    readAnalysis: async (kind,lottery,drawPeriod) => {
        const artifact = await readCompletedMatrixAnalysis('tianyan',lottery,drawPeriod);
        return artifact === null ? null : { ...artifact,data:artifact.data as TianyanArtifact };
    },
});
const matrixTiangongRoutes = createMatrixTiangongRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    readAnalysis: async (kind,lottery,drawPeriod) => {
        const artifact = await readCompletedMatrixAnalysis('tiangong',lottery,drawPeriod);
        return artifact === null ? null : { ...artifact,data:artifact.data as TiangongArtifact };
    },
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
const lineLogout = createLineLogout(loadMatrixSupabaseConfig, loadLineLoginConfig);
const lineLogoutRoutes = createLineLogoutRoutes({ logout: lineLogout.logout });
const lineAuthRouteHandlers = createLineAuthRouteHandlers({
    logoutPost: input => lineLogoutRoutes.post(input),
    authorizationHeader,
    json,
});

export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
    'POST /api/matrix/algorithm/tianyan': [async ({ body,event }) => {
        const response = await matrixTianyanRoutes.list({ authorization:authorizationHeader(event),body });
        return json(response.body,response.status);
    }],
    'POST /api/matrix/algorithm/tianyan/validation': [async ({ body,event }) => {
        const response = await matrixTianyanRoutes.validation({ authorization:authorizationHeader(event),body });
        return json(response.body,response.status);
    }],
    'POST /api/matrix/algorithm/tiangong': [async ({ body,event }) => {
        const response = await matrixTiangongRoutes.list({ authorization:authorizationHeader(event),body });
        return json(response.body,response.status);
    }],
    'POST /api/matrix/algorithm/tiangong/validation': [async ({ body,event }) => {
        const response = await matrixTiangongRoutes.validation({ authorization:authorizationHeader(event),body });
        return json(response.body,response.status);
    }],
    'GET /api/matrix/status/settings': [async ({ event }) => {
        const response = await matrixCustomStatusRoutes.list({ authorization:authorizationHeader(event),body:{} });
        return json(response.body,response.status);
    }],
    'POST /api/matrix/status/settings': [async ({ body,event }) => {
        const response = await matrixCustomStatusRoutes.save({ authorization:authorizationHeader(event),body });
        return json(response.body,response.status);
    }],
    'POST /api/matrix/status/settings/reset': [async ({ body,event }) => {
        const response = await matrixCustomStatusRoutes.reset({ authorization:authorizationHeader(event),body });
        return json(response.body,response.status);
    }],
    'POST /api/matrix/status': [async ({ body,event }) => {
        const response = await matrixStatusRoutes.get({ authorization:authorizationHeader(event),body });
        return json(response.body,response.status);
    }],
    ...memberRouteHandlers,
    ...lineAuthRouteHandlers,
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
