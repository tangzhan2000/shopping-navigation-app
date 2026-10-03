import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api, localDemoEnabled, type CapabilityDto, type InputMode, type LaunchPolicyDto, type ProtectionCaseDto, type RecognitionFieldDto, type RecognitionTaskDto, type SourceDto } from './src/app/api.ts';
import { palette, spacing, type as typography } from './src/app/theme.ts';

type Tab = 'task' | 'aftercare' | 'settings';
type Step = 'input' | 'confirmation' | 'candidates' | 'results';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const modeLabels: Record<InputMode, string> = { text: '描述需求', url: '商品链接', taobao_token: '淘口令' };
const fieldLabels: Record<string, string> = { query: '购物需求', quantity: '数量', url: '商品链接', sourceHost: '链接来源', taobaoToken: '淘口令' };
const caseLabels: Record<string, string> = { detected: '已记录', needs_user_action: '待你处理', handed_off: '已转交', awaiting_external: '等待平台', resolved: '已解决', dismissed: '已关闭', expired: '已过期', failed: '处理失败' };

function Action({ title, onPress, icon, secondary = false, disabled = false }: { title: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, secondary ? styles.actionSecondary : styles.actionPrimary, (pressed || disabled) && styles.dimmed]}>
    {icon && <Ionicons name={icon} size={19} color={secondary ? palette.primary : palette.white} />}
    <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{title}</Text>
  </Pressable>;
}

function Section({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeading}><Text style={typography.heading}>{title}</Text>{detail && <Text style={typography.caption}>{detail}</Text>}</View>{children}</View>;
}

function Notice({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'warning' | 'error' }) {
  return <View accessibilityRole="alert" style={[styles.notice, tone === 'warning' && styles.noticeWarning, tone === 'error' && styles.noticeError]}><Ionicons name={tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline'} size={19} color={tone === 'error' ? palette.danger : tone === 'warning' ? palette.amber : palette.primary} /><Text style={styles.noticeText}>{text}</Text></View>;
}

function ModeButton({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.modeButton, selected && styles.modeSelected]}><Text style={[styles.modeText, selected && styles.modeTextSelected]}>{title}</Text></Pressable>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('task');
  const [step, setStep] = useState<Step>('input');
  const [mode, setMode] = useState<InputMode>('text');
  const [content, setContent] = useState('');
  const [task, setTask] = useState<RecognitionTaskDto | null>(null);
  const [fields, setFields] = useState<RecognitionFieldDto[]>([]);
  const [policy, setPolicy] = useState<LaunchPolicyDto | null>(null);
  const [sources, setSources] = useState<SourceDto[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityDto[]>([]);
  const [cases, setCases] = useState<ProtectionCaseDto[]>([]);
  const [comparison, setComparison] = useState<import('./src/app/api.ts').ComparisonResultDto | null>(null);
  const [handoffNotice, setHandoffNotice] = useState('');
  const [candidates, setCandidates] = useState<import('./src/app/api.ts').CatalogCandidateDto[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<ProtectionCaseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [metadataError, setMetadataError] = useState('');
  const [consents, setConsents] = useState<import('./src/app/api.ts').ConsentRecordDto[]>([]);

  const loadMetadata = useCallback(async () => {
    try {
      const [loadedPolicy, loadedSources, loadedCapabilities, loadedConsents] = await Promise.all([api.policy(), api.sources(), api.capabilities(), api.consents()]);
      setPolicy(loadedPolicy); setSources(loadedSources); setCapabilities(loadedCapabilities); setConsents(loadedConsents); setMetadataError('');
    } catch { setMetadataError('当前无法读取市场和来源范围，请检查服务连接。'); }
  }, []);

  const loadCases = useCallback(async () => {
    if (!localDemoEnabled()) return;
    try { setCases(await api.cases()); setError(''); }
    catch { setError('购后待办暂时无法读取，请稍后重试。'); }
  }, []);

  useEffect(() => { void loadMetadata(); }, [loadMetadata]);
  useEffect(() => { if (tab === 'aftercare') void loadCases(); }, [tab, loadCases]);

  const recognize = async () => {
    if (!content.trim()) { setError('先说说你想买什么，或粘贴商品链接。'); return; }
    if (!localDemoEnabled()) { setError('识别服务目前仅开放本地演示，暂不能提交购物需求。'); return; }
    setBusy(true); setError('');
    try {
      const created = await api.recognize(mode, content.trim());
      if (created.status !== 'needs_confirmation' || created.fields.length === 0) { setError('没有识别到可确认的内容，请换一种描述再试。'); return; }
      setTask(created); setFields(created.fields.map((field: RecognitionFieldDto) => ({ ...field }))); setStep('confirmation');
    } catch { setError('识别没有完成，请检查网络或改用文字重试。'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!task || fields.some((field) => !field.value.trim())) { setError('请补全待确认字段。'); return; }
    setBusy(true); setError('');
    let confirmedTask: RecognitionTaskDto;
    try {
      confirmedTask = await api.confirmTask(task.taskId, fields);
    } catch {
      setError('确认失败，内容仍保留在本页，请重试。'); setBusy(false); return;
    }
    setTask(confirmedTask); setFields(confirmedTask.fields); setComparison(null); setHandoffNotice(''); setCandidates([]); setSelectedCandidateId(null); setStep('candidates');
    const quantity = Number(confirmedTask.fields.find((field) => field.name === 'quantity')?.value ?? '1');
    const query = confirmedTask.fields.find((field) => field.name === 'query')?.value.trim();
    const url = confirmedTask.fields.find((field) => field.name === 'url')?.value.trim();
    if (!policy || !Number.isInteger(quantity) || quantity < 1 || (!query && !url)) {
      setError('当前确认内容不足以查找目录商品；请修改为商品描述或商品链接后重试。'); setBusy(false); return;
    }
    try {
      const resolved = await api.resolveCatalog({ taskId: confirmedTask.taskId, currency: policy.currency, country: policy.marketCode });
      setCandidates(resolved.candidates);
    } catch { setError('商品目录暂不可用，请重试或修改输入。'); }
    finally { setBusy(false); }
  };

  const compareSelectedCandidate = async () => {
    const selected = candidates.find((candidate) => candidate.candidateId === selectedCandidateId);
    if (!selected || (selected.matchLevel !== 'exact' && selected.matchLevel !== 'variant') || !policy || !task || task.status !== 'confirmed') return;
    const quantity = Number(fields.find((field) => field.name === 'quantity')?.value ?? '1');
    setBusy(true); setError('');
    try {
      setComparison(await api.compare({ taskId: task.taskId, candidateId: selected.candidateId, quantity, currency: policy.currency, country: policy.marketCode }));
      setStep('results');
    } catch { setError('比较服务暂不可用，候选商品仍保留。'); }
    finally { setBusy(false); }
  };

  const prepareSandboxHandoff = async () => {
    const selected = candidates.find((candidate) => candidate.candidateId === selectedCandidateId);
    const cost = comparison?.results.find((item) => item.offer.sourceId === selected?.listing.sourceId && item.offer.variantId === selected?.variant.variantId)?.totalCost;
    if (!task || !selected || !cost || cost.state !== 'verified' || cost.unknownComponents.length > 0) {
      setError('报价证据不完整，不能进行官方入口预检。'); return;
    }
    setBusy(true); setError(''); setHandoffNotice('');
    try {
      const result = await api.prepareSandboxHandoff({ taskId: task.taskId, candidateId: selected.candidateId,
        variantId: selected.variant.variantId, sourceId: selected.listing.sourceId,
        quantity: comparison!.comparisonScope.quantity, budgetMinor: cost.totalMinor, priceConditionsAccepted: true });
      setHandoffNotice(result.notice);
    } catch { setError('官方入口预检未通过；当前不提供真实平台跳转。'); }
    finally { setBusy(false); }
  };

  const clearTask = async () => {
    if (task) { try { await api.deleteTask(task.taskId); } catch { /* A vanished in-memory task still clears locally. */ } }
    setTask(null); setFields([]); setContent(''); setComparison(null); setHandoffNotice(''); setStep('input'); setError('');
  };

  const input = <>
    <View style={styles.intro}><Text style={styles.eyebrow}>省心购</Text><Text style={styles.headline}>今天想买什么？</Text><Text style={styles.lead}>先说需求。商品、价格和来源都要有据可查。</Text></View>
    <View style={styles.composer}>
      <View style={styles.modes}>{(Object.keys(modeLabels) as InputMode[]).map((item) => <ModeButton key={item} title={modeLabels[item]!} selected={mode === item} onPress={() => { setMode(item); setError(''); }} />)}</View>
      <TextInput accessibilityLabel={modeLabels[mode]!} multiline placeholder={mode === 'text' ? '例如：想买两件无香洗衣液，预算 100 元' : mode === 'url' ? '粘贴商品的完整链接' : '粘贴你主动复制的淘口令'} placeholderTextColor={palette.muted} value={content} onChangeText={setContent} style={styles.textArea} textAlignVertical="top" />
      <Action title={busy ? '识别中…' : '识别购物需求'} icon="arrow-forward-outline" disabled={busy} onPress={() => { void recognize(); }} />
    </View>
    {error && <Notice text={error} tone="error" />}
    <Section title="其他输入方式" detail="当前服务尚未接入语音转写或图片识别">
      <View style={styles.inputOptions}><Pressable style={styles.inputOption} onPress={() => setError('语音识别暂不可用，请使用文字输入。')}><Ionicons name="mic-outline" size={23} color={palette.muted} /><Text style={styles.optionText}>语音</Text><Text style={typography.caption}>暂不可用</Text></Pressable><Pressable style={styles.inputOption} onPress={() => setError('图片识别暂不可用，请手动描述商品。')}><Ionicons name="image-outline" size={23} color={palette.muted} /><Text style={styles.optionText}>拍照或相册</Text><Text style={typography.caption}>暂不可用</Text></Pressable></View>
    </Section>
    <Section title="当前可用范围"><Text style={typography.body}>{policy ? `${policy.marketCode} 市场 · ${policy.currency} · ${policy.allowedCategories.join('、')}` : '正在确认市场范围'}</Text><Text style={[typography.caption, styles.sectionSubtext]}>平台报价尚未接入；不会以测试数据代替真实商品价格。</Text>{metadataError && <Notice text={metadataError} tone="warning" />}</Section>
  </>;

  const confirmation = <>
    <Pressable style={styles.back} onPress={() => { setStep('input'); setError(''); }} accessibilityRole="button"><Ionicons name="arrow-back" size={20} color={palette.ink} /><Text style={typography.label}>修改输入</Text></Pressable>
    <Text style={typography.title}>确认识别内容</Text><Text style={styles.lead}>我们只识别了以下信息，商品身份和报价尚未核实。</Text>
    <Notice text="请核对识别结果；修改后会随确认保存到本次识别任务。" tone="warning" />
    {fields.map((field, index) => <View key={field.name} style={styles.field}><View style={styles.fieldHeading}><Text style={typography.label}>{fieldLabels[field.name] ?? field.name}</Text><Text style={styles.confidence}>{Math.round(field.confidence * 100)}% 置信度 · 请核对</Text></View><TextInput accessibilityLabel={fieldLabels[field.name] ?? field.name} value={field.value} onChangeText={(value) => setFields((current) => current.map((item, i) => i === index ? { ...item, value } : item))} style={styles.fieldInput} multiline={field.name === 'query'} /></View>)}
    {error && <Notice text={error} tone="error" />}
    <Action title={busy ? '处理中…' : '确认并查找商品'} icon="checkmark-outline" disabled={busy} onPress={() => { void confirm(); }} />
    <View style={styles.inlineAction}><Action title="清除本次任务" secondary icon="trash-outline" onPress={() => { void clearTask(); }} /></View>
  </>;

  const candidatesView = <>
    <Pressable style={styles.back} onPress={() => { setStep('confirmation'); setError(''); }} accessibilityRole="button"><Ionicons name="arrow-back" size={20} color={palette.ink} /><Text style={typography.label}>修改确认内容</Text></Pressable>
    <Text style={typography.title}>匹配候选</Text>
    <Text style={styles.lead}>仅经明确确认的精确商品可以进入同款报价比较。</Text>
    {error && <Notice text={error} tone="error" />}
    {!error && candidates.length === 0 && <Notice text="没有找到可验证的精确商品；当前不会进行同款价格比较。" tone="warning" />}
    {candidates.map((candidate) => <Pressable key={candidate.candidateId} accessibilityRole="radio" accessibilityState={{ selected: selectedCandidateId === candidate.candidateId, disabled: candidate.matchLevel !== 'exact' }} onPress={() => candidate.matchLevel === 'exact' && setSelectedCandidateId(candidate.candidateId)} style={[styles.caseRow, selectedCandidateId === candidate.candidateId && styles.candidateSelected]}>
      <View style={styles.caseLine}><Text style={typography.label}>{candidate.product.title}</Text><Text style={styles.caseStatus}>{candidate.matchLevel === 'exact' ? '精确匹配' : candidate.matchLevel === 'variant' ? '不同规格' : '无法确认'}</Text></View>
      <Text style={typography.caption}>{candidate.product.brand ?? candidate.product.category} · {Object.entries(candidate.variant.attributes).map(([key, value]) => `${key}: ${value}`).join(' · ')}</Text>
      <Text style={typography.caption}>来源：{candidate.listing.sourceId} · 价格状态：{candidate.priceState}</Text>
      <Text style={typography.caption}>{candidate.reasons.join('；')}</Text>
      {candidate.missingAttributes.length > 0 && <Text style={typography.caption}>缺少规格：{candidate.missingAttributes.join('、')}</Text>}
      {candidate.matchLevel !== 'exact' && <Text style={typography.caption}>此候选不可用于同款比较。</Text>}
    </Pressable>)}
    {candidates.some((candidate) => candidate.matchLevel === 'exact') && <Action title={busy ? '比较中…' : '比较所选精确商品'} icon="git-compare-outline" disabled={busy || !selectedCandidateId} onPress={() => { void compareSelectedCandidate(); }} />}
    <Action title="重新查找" secondary icon="refresh-outline" disabled={busy} onPress={() => { void confirm(); }} />
    <View style={styles.inlineAction}><Action title="清除本次任务" secondary icon="trash-outline" onPress={() => { void clearTask(); }} /></View>
  </>;

  const results = <>
    <Text style={typography.title}>{comparison?.results.length ? '可验证结果' : '确认完成'}</Text><Text style={styles.lead}>{comparison?.results.length ? '结果仅代表已登记来源和当前证据窗口。' : '已记录本次识别确认，但目前没有可验证的商品报价。'}</Text>
    {!comparison && <Notice text="尚未匹配到可比商品或报价服务不可用；不会把测试商品当作你的需求。" tone="warning" />}
    {comparison?.results.map((item) => <View key={item.offer.offerId} style={styles.caseRow}><View style={styles.caseLine}><Text style={typography.label}>{item.offer.sourceId}</Text><Text style={styles.caseStatus}>{item.totalCost.currency} {(item.totalCost.totalMinor / 100).toFixed(2)}</Text></View><Text style={typography.caption}>价格状态：{item.totalCost.state} · 库存：{item.offer.availability}</Text><Text style={typography.caption}>采集：{new Date(item.offer.price.capturedAt).toLocaleString('zh-CN')} · 未知项：{item.totalCost.unknownComponents.join('、') || '无'}</Text></View>)}
    <Section title="你的需求">{fields.map((field) => <View key={field.name} style={styles.summaryRow}><Text style={typography.caption}>{fieldLabels[field.name] ?? field.name}</Text><Text style={typography.body}>{field.value}</Text></View>)}</Section>
    <Section title="来源覆盖" detail="报价不是全网最低价承诺"><Text style={typography.body}>可验证报价 {comparison?.results.length ?? 0} 条</Text><Text style={[typography.caption, styles.sectionSubtext]}>{comparison?.evidencePolicy ?? (policy ? `市场 ${policy.marketCode} · ${policy.currency}` : '市场状态未取得')}</Text></Section>
    {!!comparison && <Notice text="点击预检即确认当前展示的商品、规格、来源、数量、总价和价格条件。只做本地沙盒校验，不会打开购物平台；正式授权来源、价格及官方入口尚未接入。" tone="warning" />}
    {!!comparison && <Action title="确认价格条件并沙盒预检" icon="shield-checkmark-outline" disabled={busy || !candidates.some((candidate) => candidate.candidateId === selectedCandidateId && comparison.results.some((item) => item.offer.sourceId === candidate.listing.sourceId && item.offer.variantId === candidate.variant.variantId && item.totalCost.state === 'verified' && item.totalCost.unknownComponents.length === 0))} onPress={() => { void prepareSandboxHandoff(); }} />}
    {!!handoffNotice && <Notice text={`预检结果：${handoffNotice} 没有打开链接或创建订单。`} />}
    {error && <Notice text={error} tone="error" />}
    <Action title="修改需求" icon="create-outline" onPress={() => { setStep('input'); setError(''); }} />
    <View style={styles.inlineAction}><Action title="清除本次任务" secondary icon="trash-outline" onPress={() => { void clearTask(); }} /></View>
  </>;

  const aftercare = <>
    <Text style={typography.title}>购物守护</Text><Text style={styles.lead}>只展示你主动提交的事项；目前没有平台订单自动同步。</Text>
    {!localDemoEnabled() ? <Notice text="购后待办目前仅在本地演示身份下可查看，正式账号服务尚未接入。" tone="warning" /> : <>
      {error && <Notice text={error} tone="error" />}
      {cases.length === 0 ? <View style={styles.empty}><Ionicons name="shield-checkmark-outline" size={32} color={palette.primary} /><Text style={typography.heading}>还没有待处理事项</Text><Text style={typography.caption}>主动提交的购后问题会显示在这里。</Text></View> : cases.map((item) => <Pressable key={item.caseId} onPress={() => setSelectedCase(item)} style={styles.caseRow}><View style={styles.caseLine}><Text style={typography.label}>{item.issueType.replaceAll('_', ' ')}</Text><Text style={styles.caseStatus}>{caseLabels[item.status] ?? item.status}</Text></View><Text style={typography.caption}>{item.nextUserAction ?? '打开查看详情'} · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}</Text></Pressable>)}
      {selectedCase && <View style={styles.caseDetail}><Pressable onPress={() => setSelectedCase(null)} accessibilityRole="button" style={styles.back}><Ionicons name="close-outline" size={22} color={palette.ink} /><Text style={typography.label}>关闭详情</Text></Pressable><Text style={typography.heading}>{caseLabels[selectedCase.status] ?? selectedCase.status}</Text><Text style={typography.body}>{selectedCase.nextUserAction ?? '等待下一步处理信息。'}</Text><Text style={typography.caption}>更新时间：{new Date(selectedCase.updatedAt).toLocaleString('zh-CN')}</Text><Text style={typography.caption}>证据：{selectedCase.event.evidence.map((item) => item.summary ?? '用户主动提交').join('；') || '无'}</Text></View>}
      <View style={styles.inlineAction}><Action title="刷新待办" secondary icon="refresh-outline" onPress={() => { void loadCases(); }} /></View>
    </>}
  </>;

  const settings = <>
    <Text style={typography.title}>范围与隐私</Text><Text style={styles.lead}>当前版本是本地原生应用原型，尚未接入正式平台账号与报价。</Text>
    <Section title="市场与来源"><Text style={typography.body}>{policy ? `${policy.marketCode} · ${policy.currency}` : '尚未取得市场信息'}</Text><Text style={[typography.caption, styles.sectionSubtext]}>登记来源：{sources.map((source) => source.sourceId).join('、') || '无'}。测试来源不构成可用平台覆盖。</Text></Section>
    <Section title="能力状态">{capabilities.length ? capabilities.map((item) => <View key={item.capabilityId} style={styles.summaryRow}><Text style={typography.label}>{item.capabilityId}</Text><Text style={typography.caption}>{item.state}{item.reason ? ` · ${item.reason}` : ''}</Text></View>) : <Text style={typography.caption}>尚未取得能力状态。</Text>}</Section>
    <Section title="同意与数据范围" detail="可随时撤回；撤回后对应任务和提醒不会继续使用该用途。">
      {['recognition', 'source_access', 'personalization', 'notifications', 'orders', 'rewards'].map((purpose) => {
        const record = consents.find((item) => item.purpose === purpose && item.state === 'granted');
        const labels: Record<string, string> = { recognition: '识别购物需求', source_access: '查询已授权来源', personalization: '保存个性化偏好', notifications: '发送提醒', orders: '读取订单/物流', rewards: '返现与权益' };
        return <View key={purpose} style={styles.consentRow}><View style={styles.consentCopy}><Text style={typography.label}>{labels[purpose]}</Text><Text style={typography.caption}>{record ? `已同意 · ${new Date(record.grantedAt).toLocaleDateString('zh-CN')}` : '未启用'}</Text></View><Pressable accessibilityRole="switch" accessibilityState={{ checked: Boolean(record) }} onPress={() => { void (record ? api.revokeConsent(purpose as import('./src/app/api.ts').ConsentPurpose) : api.grantConsent(purpose as import('./src/app/api.ts').ConsentPurpose)).then(() => loadMetadata()).catch(() => setMetadataError('同意状态更新失败，请稍后重试。')); }} style={[styles.consentButton, record && styles.consentButtonOn]}><Text style={[styles.consentButtonText, record && styles.consentButtonTextOn]}>{record ? '撤回' : '启用'}</Text></Pressable></View>;
      })}
    </Section>
    <Section title="数据说明"><Text style={typography.body}>识别任务目前存于服务进程内；清除本次任务会请求删除并清空当前页面。没有平台订单同步、返现余额或自动购买。未获授权的语音、图片、OAuth、支付能力保持受限。</Text></Section>
    {metadataError && <Notice text={metadataError} tone="warning" />}
    <Action title="刷新范围" secondary icon="refresh-outline" onPress={() => { void loadMetadata(); }} />
  </>;

  return <SafeAreaView style={styles.root}><StatusBar style="dark" /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{tab === 'task' ? step === 'input' ? input : step === 'confirmation' ? confirmation : step === 'candidates' ? candidatesView : results : tab === 'aftercare' ? aftercare : settings}</ScrollView><View style={styles.nav}>{([['task', 'search-outline', '任务'], ['aftercare', 'shield-checkmark-outline', '守护'], ['settings', 'options-outline', '设置']] as const).map(([id, icon, title]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={styles.navItem} onPress={() => { setTab(id); setError(''); }}><Ionicons name={icon} size={23} color={tab === id ? palette.primary : palette.muted} /><Text style={[styles.navText, tab === id && styles.navSelected]}>{title}</Text></Pressable>)}</View></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, root: { flex: 1, backgroundColor: palette.canvas }, content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 44, gap: 22 },
  intro: { paddingTop: 8, gap: 6 }, eyebrow: { color: palette.primary, fontSize: 14, fontWeight: '700' }, headline: { color: palette.ink, fontSize: 32, lineHeight: 42, fontWeight: '700' }, lead: { color: palette.muted, fontSize: 15, lineHeight: 24, marginTop: 4 },
  composer: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: spacing.lg, gap: spacing.lg }, modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, modeButton: { paddingVertical: 8, paddingHorizontal: 11, borderRadius: 6, borderWidth: 1, borderColor: palette.line }, modeSelected: { borderColor: palette.primary, backgroundColor: palette.primarySoft }, modeText: { color: palette.muted, fontSize: 13, fontWeight: '600' }, modeTextSelected: { color: palette.primary },
  textArea: { minHeight: 110, color: palette.ink, fontSize: 16, lineHeight: 24, padding: spacing.md, borderWidth: 1, borderColor: palette.line, borderRadius: 6 }, action: { minHeight: 48, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: 6 }, actionPrimary: { backgroundColor: palette.primary }, actionSecondary: { borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.white }, actionText: { color: palette.white, fontSize: 15, fontWeight: '700' }, actionTextSecondary: { color: palette.primary }, dimmed: { opacity: 0.55 }, inlineAction: { alignItems: 'flex-start' },
  section: { gap: spacing.md, borderTopWidth: 1, borderColor: palette.line, paddingTop: spacing.xl }, sectionHeading: { gap: 3 }, sectionSubtext: { marginTop: spacing.sm }, inputOptions: { flexDirection: 'row', gap: spacing.md }, inputOption: { flex: 1, minHeight: 104, borderWidth: 1, borderColor: palette.line, borderRadius: 6, backgroundColor: palette.surface, padding: spacing.md, gap: spacing.xs }, optionText: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: spacing.sm, backgroundColor: palette.primarySoft, borderRadius: 6, padding: spacing.md }, noticeWarning: { backgroundColor: palette.amberSoft }, noticeError: { backgroundColor: palette.dangerSoft }, noticeText: { color: palette.ink, fontSize: 14, lineHeight: 21, flex: 1 },
  back: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', minHeight: 44 }, field: { gap: spacing.sm }, fieldHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }, confidence: { color: palette.amber, fontSize: 13 }, fieldInput: { minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: 6, backgroundColor: palette.surface, color: palette.ink, padding: spacing.md, fontSize: 16 }, summaryRow: { gap: 3, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: palette.line },
  consentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: palette.line }, consentCopy: { flex: 1, gap: 3 }, consentButton: { minWidth: 62, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface }, consentButtonOn: { borderColor: palette.primary, backgroundColor: palette.primarySoft }, consentButtonText: { color: palette.muted, fontSize: 13, fontWeight: '700' }, consentButtonTextOn: { color: palette.primary },
  empty: { minHeight: 170, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: spacing.xl }, caseRow: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 6, padding: spacing.lg, gap: spacing.sm }, candidateSelected: { borderColor: palette.primary, backgroundColor: palette.primarySoft }, caseLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }, caseStatus: { color: palette.amber, fontSize: 13, fontWeight: '700' }, caseDetail: { gap: spacing.md, padding: spacing.lg, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 8 },
  nav: { flexDirection: 'row', backgroundColor: palette.surface, borderTopWidth: 1, borderColor: palette.line, paddingBottom: Platform.OS === 'android' ? 8 : 0 }, navItem: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3 }, navText: { color: palette.muted, fontSize: 12, fontWeight: '600' }, navSelected: { color: palette.primary },
});
