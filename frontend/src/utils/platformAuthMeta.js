/** 平台授权方式与文案（与 local-agent/auth.js、playwrightAuth.js 对齐） */

export const PLATFORM_AUTH = {
  今日头条: {
    mode: 'qr_app',
    label: '今日头条',
    /** 授权弹窗说明 */
    authHint:
      '今日头条须使用「今日头条」手机 App 扫描浏览器中的登录二维码完成授权，无法在网页内用手机号直接登录。',
    publishHint:
      '发布内容前，请在今日头条 App 或创作者后台完成账号实名/绑定手机号，否则可能无法发稿。',
    step1Title: '请用今日头条 App 扫码',
    step1Desc:
      '在弹出的浏览器窗口中找到登录二维码，打开手机「今日头条」App 扫码并确认登录。登录成功后点击下方「我已完成登录」。',
    hidePhoneInput: true,
    /** 投放任务：文章标题字数上限 */
    titleMaxLength: 30,
    tagsSupported: false,
  },
  百度百家号: {
    mode: 'qr_app',
    label: '百度百家号',
    authHint:
      '请使用「百度 App」或「手机百度」扫描浏览器登录页中的二维码完成百家号授权；也可使用百度账号密码登录。',
    publishHint:
      '发布图文前请确认百家号已开通图文权限并完成实名认证，否则可能无法进入编辑器或发布失败。',
    step1Title: '请用百度 App 扫码',
    step1Desc:
      '在弹出的浏览器窗口中完成百度账号登录（推荐 App 扫码）。进入百家号后台后点击下方「我已完成登录」。',
    hidePhoneInput: true,
    titleMaxLength: 30,
    tagsSupported: false,
  },
  小红书: {
    titleMaxLength: 20,
    tagsSupported: true,
  },
}

export function getPlatformAuthMeta(platform) {
  return PLATFORM_AUTH[platform] || null
}

export function isQrAppAuthPlatform(platform) {
  return getPlatformAuthMeta(platform)?.mode === 'qr_app'
}

export function getPlatformTitleMaxLength(platform) {
  return getPlatformAuthMeta(platform)?.titleMaxLength ?? 100
}

export function platformSupportsTags(platform) {
  const meta = getPlatformAuthMeta(platform)
  if (meta && meta.tagsSupported === false) return false
  return true
}
