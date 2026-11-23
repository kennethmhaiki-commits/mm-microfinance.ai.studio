import { AuthSession, StaffPermission, ViewTab } from '../types';

export interface PermissionDefinition {
  key: StaffPermission;
  label: string;
  description: string;
  category: 'Msingi & Wateja' | 'Mikopo & Fedha' | 'Ripoti & Mipangilio';
  sensitive: boolean;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    key: 'view_dashboard',
    label: 'Dashibodi Kuu',
    description: 'Kuona muhtasari wa biashara, kadi za takwimu, na makusanyo ya jumla.',
    category: 'Msingi & Wateja',
    sensitive: false,
  },
  {
    key: 'manage_customers',
    label: 'Wateja & Usajili wa Mikopo',
    description: 'Kusajili wateja wapya, kuona taarifa zao, na kutoa mikopo mipya.',
    category: 'Msingi & Wateja',
    sensitive: false,
  },
  {
    key: 'edit_delete_customers',
    label: 'Kuhariri na Kufuta Wateja',
    description: 'Ngazi nyeti: Kubadilisha taarifa za wateja au kufuta rekodi za wateja.',
    category: 'Msingi & Wateja',
    sensitive: true,
  },
  {
    key: 'manage_applications',
    label: 'Wateja wa Mtandaoni & Google Forms',
    description: 'Ngazi nyeti: Kupitia, kuidhinisha, au kukataa maombi ya mikopo mtandaoni.',
    category: 'Msingi & Wateja',
    sensitive: true,
  },
  {
    key: 'view_loans_penalties',
    label: 'Mikopo Inayoendelea',
    description: 'Kuangalia orodha ya mikopo inayoendelea, iliyochelewa, na iliyokamilika.',
    category: 'Mikopo & Fedha',
    sensitive: false,
  },
  {
    key: 'apply_penalties',
    label: 'Kuweka Adhabu za Kuchelewa',
    description: 'Ngazi nyeti: Kuongeza adhabu (penalty) kwenye mikopo iliyochelewa.',
    category: 'Mikopo & Fedha',
    sensitive: true,
  },
  {
    key: 'view_schedule',
    label: 'Ratiba ya Marejesho',
    description: 'Kuona ratiba ya makusanyo ya kila wiki na kila mwezi.',
    category: 'Mikopo & Fedha',
    sensitive: false,
  },
  {
    key: 'collect_repayments',
    label: 'Kupokea Marejesho & Risiti',
    description: 'Kurekodi malipo ya marejesho ya wateja na kutoa risiti rasmi.',
    category: 'Mikopo & Fedha',
    sensitive: false,
  },
  {
    key: 'manage_bank_debit',
    label: 'Makato ya Benki (API) & Check Number',
    description: 'Ngazi nyeti: Kutuma makato ya moja kwa moja kwenda NMB, CRDB, EXIM au Utumishi.',
    category: 'Mikopo & Fedha',
    sensitive: true,
  },
  {
    key: 'use_calculator',
    label: 'Kikokotoo cha Mkopo',
    description: 'Kukokotoa riba na marejesho ya mteja kabla ya usajili.',
    category: 'Mikopo & Fedha',
    sensitive: false,
  },
  {
    key: 'view_contracts',
    label: 'Mkataba wa Mkopo',
    description: 'Kufungua na kuchapisha mikataba rasmi ya mkopo.',
    category: 'Mikopo & Fedha',
    sensitive: false,
  },
  {
    key: 'send_messages',
    label: 'Ujumbe wa WhatsApp & SMS',
    description: 'Kutuma vikumbusho vya marejesho kwa WhatsApp, SMS, au barua pepe.',
    category: 'Ripoti & Mipangilio',
    sensitive: false,
  },
  {
    key: 'view_revenue_reports',
    label: 'Ripoti ya Mapato & Google Slides',
    description: 'Ngazi nyeti: Kuona grafu za mapato, faida ya riba, na ripoti za Google Slides.',
    category: 'Ripoti & Mipangilio',
    sensitive: true,
  },
  {
    key: 'manage_loan_types',
    label: 'Aina za Mikopo',
    description: 'Ngazi nyeti: Kuongeza, kuhariri, au kufuta bidhaa na viwango vya mikopo.',
    category: 'Ripoti & Mipangilio',
    sensitive: true,
  },
  {
    key: 'manage_company_settings',
    label: 'Taarifa za Kampuni',
    description: 'Ngazi nyeti: Kubadilisha jina la kampuni, anwani, simu, na adhabu kuu.',
    category: 'Ripoti & Mipangilio',
    sensitive: true,
  },
];

export const ALL_STAFF_PERMISSIONS: StaffPermission[] = PERMISSION_CATALOG.map((p) => p.key);

export interface RolePreset {
  id: string;
  label: string;
  roleTitle: string;
  summary: string;
  permissions: StaffPermission[];
}

export const STAFF_ROLE_PRESETS: RolePreset[] = [
  {
    id: 'karani',
    label: 'Karani wa Mapokezi (Msingi)',
    roleTitle: 'Karani wa Mapokezi',
    summary: 'Anaweza kuona Dashibodi, Ratiba, Kikokotoo na Mikataba; hawezi kufuta, kutoza adhabu, au kuona ripoti za mapato.',
    permissions: ['view_dashboard', 'view_schedule', 'use_calculator', 'view_contracts'],
  },
  {
    id: 'afisa_marejesho',
    label: 'Afisa Marejesho',
    roleTitle: 'Afisa Marejesho',
    summary: 'Anapokea marejesho, kutoa risiti, kufuatilia ratiba na kutuma ujumbe; hawezi kufuta wateja au kubadili mipangilio.',
    permissions: [
      'view_dashboard',
      'view_loans_penalties',
      'view_schedule',
      'collect_repayments',
      'send_messages',
      'view_contracts',
    ],
  },
  {
    id: 'afisa_mikopo',
    label: 'Afisa Mikopo',
    roleTitle: 'Afisa Mikopo',
    summary: 'Anasajili wateja na mikopo, kupokea marejesho, na kushughulikia maombi ya mtandaoni; hawezi kufuta wateja au kubadili taarifa za kampuni.',
    permissions: [
      'view_dashboard',
      'manage_applications',
      'manage_customers',
      'view_loans_penalties',
      'view_schedule',
      'collect_repayments',
      'send_messages',
      'use_calculator',
      'view_contracts',
    ],
  },
  {
    id: 'mhasibu',
    label: 'Mhasibu / Msimamizi wa Fedha',
    roleTitle: 'Mhasibu',
    summary: 'Ana uwezo wa mapato, marejesho, adhabu, na makato ya benki; mipangilio ya kampuni imefungwa.',
    permissions: [
      'view_dashboard',
      'view_loans_penalties',
      'apply_penalties',
      'view_schedule',
      'collect_repayments',
      'view_revenue_reports',
      'manage_bank_debit',
      'view_contracts',
      'use_calculator',
    ],
  },
];

export const TAB_REQUIRED_PERMISSION: Partial<Record<ViewTab, StaffPermission>> = {
  dashboard: 'view_dashboard',
  applications: 'manage_applications',
  customers: 'manage_customers',
  loans: 'view_loans_penalties',
  schedule: 'view_schedule',
  collections: 'collect_repayments',
  revenue_report: 'view_revenue_reports',
  bank_debit: 'manage_bank_debit',
  slides: 'view_revenue_reports',
  google_forms: 'manage_applications',
  messaging: 'send_messages',
  calculator: 'use_calculator',
  contract: 'view_contracts',
  loan_types: 'manage_loan_types',
  company: 'manage_company_settings',
};

export function hasPermission(session: AuthSession | null, permission: StaffPermission): boolean {
  if (!session) return false;
  if (session.actorType === 'admin') return true;
  return session.permissions.includes(permission);
}

export function hasTabAccess(session: AuthSession | null, tab: ViewTab): boolean {
  if (!session) return false;
  if (tab === 'staff') {
    return session.actorType === 'admin';
  }
  if (session.actorType === 'admin') return true;
  const req = TAB_REQUIRED_PERMISSION[tab];
  if (!req) return false;
  return session.permissions.includes(req);
}

export function getFirstAllowedTab(session: AuthSession | null): ViewTab {
  if (!session || session.actorType === 'admin') return 'dashboard';
  const order: ViewTab[] = [
    'dashboard',
    'collections',
    'schedule',
    'customers',
    'loans',
    'applications',
    'messaging',
    'calculator',
    'contract',
    'revenue_report',
    'bank_debit',
    'slides',
    'google_forms',
    'loan_types',
    'company',
  ];
  for (const tab of order) {
    if (hasTabAccess(session, tab)) return tab;
  }
  return 'dashboard';
}

export function getPermissionLabel(key: StaffPermission): string {
  return PERMISSION_CATALOG.find((p) => p.key === key)?.label || key;
}
