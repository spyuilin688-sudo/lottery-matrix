from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    file.write_text(text.replace(old, new, 1))


replace_once(
    'backend/index.ts',
    "import { createMemberOnlineRpc, createMemberOnlineService } from './member-online';\n",
    "import { createMemberOnlineRpc, createMemberOnlineService } from './member-online';\n"
    "import { createMemberProfileStore } from './member-profile-store';\n"
    "import { createMemberProfileRoutes } from './member-profile-routes';\n"
    "import { createMemberNotificationStore } from './member-notification-store';\n"
    "import { createMemberNotificationRoutes } from './member-notification-routes';\n",
)

replace_once(
    'backend/index.ts',
    "const matrixMemberAuth = createMemberAuth(loadMatrixSupabaseConfig);\nconst memberOnlineService = createMemberOnlineService(createMemberOnlineRpc(loadMatrixSupabaseConfig));\n",
    "const matrixMemberAuth = createMemberAuth(loadMatrixSupabaseConfig);\n"
    "const memberProfileStore = createMemberProfileStore(loadMatrixSupabaseConfig);\n"
    "const memberProfileRoutes = createMemberProfileRoutes({\n"
    "    requireMember: authorization => matrixMemberAuth.requireMember(authorization),\n"
    "    readProfile: memberId => memberProfileStore.read(memberId),\n"
    "});\n"
    "const memberNotificationStore = createMemberNotificationStore(loadMatrixSupabaseConfig);\n"
    "const memberNotificationRoutes = createMemberNotificationRoutes({\n"
    "    requireMember: authorization => matrixMemberAuth.requireMember(authorization),\n"
    "    store: memberNotificationStore,\n"
    "});\n"
    "const memberOnlineService = createMemberOnlineService(createMemberOnlineRpc(loadMatrixSupabaseConfig));\n",
)

replace_once(
    'backend/index.ts',
    "    'POST /api/member-online/start': [async ({ event }) => { try { const member=await matrixMemberAuth.requireMember(authorizationHeader(event)); return json(await memberOnlineService.start(member.memberId)); } catch (e) { const value=e as { code?:string;status?:number;message?:string }; return error(value.code ?? value.message ?? 'MEMBER_ONLINE_START_FAILED',value.status ?? 500); } }],\n",
    "    'GET /api/member/profile': [async ({ event }) => { const response=await memberProfileRoutes.get({authorization:authorizationHeader(event)}); return json(response.body,response.status); }],\n"
    "    'GET /api/member/notification-settings': [async ({ event }) => { const response=await memberNotificationRoutes.get({authorization:authorizationHeader(event),body:{}}); return json(response.body,response.status); }],\n"
    "    'PUT /api/member/notification-settings': [async ({ body,event }) => { const response=await memberNotificationRoutes.save({authorization:authorizationHeader(event),body}); return json(response.body,response.status); }],\n"
    "    'POST /api/member-online/start': [async ({ event }) => { try { const member=await matrixMemberAuth.requireMember(authorizationHeader(event)); return json(await memberOnlineService.start(member.memberId)); } catch (e) { const value=e as { code?:string;status?:number;message?:string }; return error(value.code ?? value.message ?? 'MEMBER_ONLINE_START_FAILED',value.status ?? 500); } }],\n",
)

replace_once(
    'src/FeaturePages.tsx',
    '} from "./matrix-status-api";\n\nexport type ScreenId =',
    '} from "./matrix-status-api";\nimport {\n'
    '  fetchMemberProfile,\n'
    '  fetchNotificationSettings,\n'
    '  saveNotificationSettings,\n'
    '  type MemberNotificationSettings,\n'
    '  type MemberProfileResponse,\n'
    '} from "./member-api";\n\nexport type ScreenId =',
)

replace_once(
    'src/FeaturePages.tsx',
    '  const [activeSettings, setActiveSettings] = useState<string | null>(null);\n  const betTimeOptions:',
    '  const [activeSettings, setActiveSettings] = useState<string | null>(null);\n'
    '  const [notificationSettingsLoaded, setNotificationSettingsLoaded] = useState(false);\n'
    '  useEffect(() => {\n'
    '    let cancelled = false;\n'
    '    void fetchNotificationSettings().then((stored) => {\n'
    '      if (cancelled) return;\n'
    '      setSettings(stored.settings);\n'
    '      setSelectedOptions(stored.selectedOptions);\n'
    '      setBetTimes(stored.betTimes);\n'
    '      setStatusOptions(stored.statusOptions);\n'
    '      setCollisionOptions(stored.collisionOptions);\n'
    '      setNotificationSettingsLoaded(true);\n'
    '    }).catch(() => undefined);\n'
    '    return () => { cancelled = true; };\n'
    '  }, []);\n'
    '  useEffect(() => {\n'
    '    if (!notificationSettingsLoaded) return;\n'
    '    const current: MemberNotificationSettings = { settings, selectedOptions, betTimes, statusOptions, collisionOptions };\n'
    '    void saveNotificationSettings(current).catch(() => undefined);\n'
    '  }, [notificationSettingsLoaded, settings, selectedOptions, betTimes, statusOptions, collisionOptions]);\n'
    '  const betTimeOptions:',
)

replace_once(
    'src/FeaturePages.tsx',
    'export function ProfilePage({ onNavigate }: { onNavigate: Navigate }) {\n  const menuGroups:',
    'export function ProfilePage({ onNavigate }: { onNavigate: Navigate }) {\n'
    '  const [memberProfile, setMemberProfile] = useState<MemberProfileResponse | null>(null);\n'
    '  useEffect(() => {\n'
    '    let cancelled = false;\n'
    '    void fetchMemberProfile().then((profile) => { if (!cancelled) setMemberProfile(profile); }).catch(() => undefined);\n'
    '    return () => { cancelled = true; };\n'
    '  }, []);\n'
    '  const memberPlanName = memberProfile?.planName ?? "";\n'
    '  const memberExpiry = memberProfile?.isLifetime ? "" : (memberProfile?.planExpiresAt ? memberProfile.planExpiresAt.slice(0, 10).replace(/-/g, "/") : "");\n'
    '  const menuGroups:',
)

replace_once(
    'src/FeaturePages.tsx',
    '<div className="profile-copy"><h2>樂彩玩家</h2><p>LINE ID：lottery_matrix</p></div>',
    '<div className="profile-copy"><h2>樂彩玩家</h2><p>LINE ID：{memberProfile?.lineUserId ?? ""}</p></div>',
)

replace_once(
    'src/FeaturePages.tsx',
    '<div><span>目前方案</span><strong>Matrix Pro 年方案</strong><p>享有所有 Matrix Pro 功能</p></div>\n          <div><span>訂閱到期日</span><strong>2027/07/23</strong><p>剩餘 365 天</p></div>',
    '<div><span>目前方案</span><strong>{memberPlanName}</strong><p /></div>\n          <div><span>訂閱到期日</span><strong>{memberExpiry}</strong><p /></div>',
)
