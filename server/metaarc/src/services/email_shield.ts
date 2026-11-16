// 职责: 邮箱安全防护与准入策略 (防一次性临时匿名邮箱、支持白名单/黑名单域名限制)
// 关联文件:
//   server/metaarc/src/services/system_settings_service.ts
//   server/metaarc/src/routes/auth.ts
//   server/metaarc/src/services/email_service.ts

const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  '20minutemail.com',
  'anonbox.net',
  'bccto.me',
  'boun.cr',
  'chacuo.net',
  'crazymailing.com',
  'disposablemail.com',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'fakemailgenerator.com',
  'fakeinbox.com',
  'forspam.com',
  'generator.email',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'inboxkitten.com',
  'linshiyouxiang.net',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mohmal.com',
  'mytemp.email',
  'nada.ltd',
  'sharklasers.com',
  'temp-mail.org',
  'tempail.com',
  'tempmail.com',
  'tempmail.net',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.me',
  'trashmail.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  '027168.com',
  '0clickemail.com',
  'armyspy.com',
  'cuvox.de',
  'dayrep.com',
  'einrot.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
]);

/**
 * 提取邮箱域名后缀并小写化
 */
export function getEmailDomain(email: string): string {
  if (!email || typeof email !== 'string') return '';
  const atIdx = email.lastIndexOf('@');
  if (atIdx === -1) return '';
  return email.slice(atIdx + 1).trim().toLowerCase();
}

/**
 * 判断是否为一次性匿名临时邮箱
 */
export function isDisposableEmail(email: string): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * 校验邮箱是否符合系统设定的准入策略（一次性邮箱拦截、白名单后缀、黑名单后缀）
 */
export function checkEmailDomainPolicy(
  email: string,
  settings: {
    block_disposable_email?: boolean;
    allowed_email_domains?: string;
    blocked_email_domains?: string;
  }
): { allowed: boolean; reason?: string } {
  const cleanEmail = email.trim().toLowerCase();
  const domain = getEmailDomain(cleanEmail);

  if (!domain) {
    return { allowed: false, reason: '邮箱地址格式无效' };
  }

  // 1. 拦截一次性匿名邮箱
  if (settings.block_disposable_email !== false && isDisposableEmail(cleanEmail)) {
    return {
      allowed: false,
      reason: '系统禁止使用临时/匿名一次性邮箱注册，请使用常用个人邮箱（如 QQ、163、Gmail 等）',
    };
  }

  // 2. 自定义黑名单域名检查
  if (settings.blocked_email_domains && typeof settings.blocked_email_domains === 'string') {
    const blockedList = settings.blocked_email_domains
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    if (blockedList.some((b) => domain === b || domain.endsWith('.' + b))) {
      return { allowed: false, reason: '该邮箱域名已被系统列入限制名单，请更换其他邮箱' };
    }
  }

  // 3. 白名单域名限制检查 (留空表示不限制任何正规域名)
  if (settings.allowed_email_domains && typeof settings.allowed_email_domains === 'string') {
    const allowedList = settings.allowed_email_domains
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    if (allowedList.length > 0) {
      const isAllowed = allowedList.some((a) => domain === a || domain.endsWith('.' + a));
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `当前系统仅限指定合作机构邮箱后缀注册 (${allowedList.map((a) => '@' + a).join('、')})`,
        };
      }
    }
  }

  return { allowed: true };
}
