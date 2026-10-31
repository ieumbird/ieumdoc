/** Shared issue fields: web forms, CLI creation and registration checks use this definition. */
export const areas = ['Editor', 'Desktop', 'Core', 'CLI', 'Host', 'Docs', 'Product'];
const field = (id, label, description, required = true) => ({ id, label, description, required });
const evidence = field('evidence', '근거 / 관련 자료', '사용자 보고와 직접 확인한 결과를 구분하고, 확인한 코드·문서·화면·관련 이슈를 연결합니다.', false);
export const types = {
  bug: {
    name: '버그 보고', description: '관찰한 오류와 기대 동작을 기록합니다.', color: 'd73a4a',
    fields: [
      field('problem', '문제', '어떤 동작을 했고 무엇을 관찰했는지 적습니다. 확인되지 않은 원인을 사실로 쓰지 않습니다.'),
      field('occurrence', '발생 상황 / 근거', '알려진 발생 상황이나 재현 절차를 적습니다. 재현하지 못했다면 사용자 보고·재현 미확인임을 명시합니다.'),
      field('expected', '기대 동작', '사용자가 기대하는 동작을 적습니다.'),
      field('environment', '환경', '알고 있는 앱 버전·OS·브라우저만 적습니다. 모르면 생략합니다.', false), evidence,
    ],
  },
  enhancement: {
    name: '개선·기능 제안', description: '현재 불편과 원하는 사용 경험을 기록합니다.', color: '0075ca',
    fields: [field('problem', '문제', '어떤 일을 하려는 상황에서 무엇이 불편하거나 불가능한지 적습니다.'),
      field('experience', '기대하는 사용 경험', '사용자에게 어떤 동작과 결과가 제공되기를 원하는지 적습니다. 구현 방식은 미리 정하지 않습니다.'), evidence],
  },
  task: {
    name: '개발 작업', description: '범위가 정해진 유지보수·문서·개발 작업을 기록합니다.', color: '5319e7',
    fields: [field('problem', '문제', '작업이 필요한 이유와 확인한 현재 상태를 적습니다.'),
      field('scope', '목표와 범위', '이번 작업의 목표와 범위를 적습니다.'),
      field('completion', '완료 기준', '작업 완료를 판단할 구체적인 결과를 적습니다. 목표를 그대로 반복하거나 미래 테스트 계획을 자동으로 추가하지 않습니다.'), evidence],
  },
  decision: {
    name: '지원 여부·설계 검토', description: '구현 전에 지원 여부·범위·사용 경험을 결정합니다.', color: '8250df',
    fields: [field('background', '검토 배경', '어떤 사용자 문제나 요구 때문에 검토가 필요한지 적습니다.'),
      field('questions', '결정할 사항', '심층적으로 분석할 사용자 경험과 지원·보류·미지원 판단, 범위 및 선행 조건을 적습니다. 구현 착수 전에 필요한 계획을 명시합니다.'),
      { ...field('state', '검토 상태', '이 이슈를 등록하는 것만으로 구현 착수를 승인하지 않습니다.'), options: ['결정 필요', '향후 검토'] }, evidence],
  },
};
const hasType = type => Object.hasOwn(types, type);

export const labelDefinitions = [
  ...Object.entries(types).map(([key, value]) => ({ name: `type:${key}`, color: value.color, description: value.name })),
  ...areas.map(area => ({ name: `area:${area.toLowerCase()}`, color: 'c5def5', description: `${area} 영역` })),
  { name: 'status:needs-decision', color: 'fbca04', description: '지원 여부나 범위의 결정 필요; 구현 착수 승인 아님' },
  { name: 'status:deferred', color: 'cfd3d7', description: '향후 검토; 현재 구현 착수 대상 아님' },
  { name: 'status:needs-info', color: 'fef2c0', description: '이슈 작성 규칙에 맞게 정보 보완 필요' },
];

export function issueForm(type) {
  const definition = types[type];
  if (!hasType(type)) throw new Error(`Unknown issue type: ${type}`);
  return {
    name: definition.name, description: definition.description,
    labels: [`type:${type}`, ...(type === 'decision' ? ['status:needs-decision'] : [])],
    body: [
      { type: 'markdown', attributes: { value: '제목은 `영역: 구체적인 증상 또는 원하는 결과`로 작성합니다. 예: `Editor: 문서 끝에서 커서 아래 여백이 부족함`. 영역을 모르면 Product를 선택합니다. 원인·구현안·테스트 계획을 추정해 채우지 않습니다. [작성 규칙](https://github.com/litzio/litzio/blob/master/docs/contributing/issues.md)' } },
      { type: 'dropdown', id: 'area', attributes: { label: '영역', options: areas, default: areas.indexOf('Product') }, validations: { required: true } },
      ...definition.fields.map(item => ({
        type: item.options ? 'dropdown' : 'textarea', id: item.id,
        attributes: { label: item.label, description: item.description, ...(item.options ? { options: item.options } : {}) },
        validations: { required: item.required },
      })),
    ],
  };
}

// Only the known form's ##/### section boundaries are read; this is not a document parser.
// Fenced code and comments cannot supply required headings, but evidence may contain code.
export function sectionsOf(body) {
  const result = new Map();
  let current, fence, comment = false;
  for (const original of String(body ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    let line = original;
    if (comment) {
      const end = line.indexOf('-->');
      if (end < 0) continue;
      comment = false; line = line.slice(end + 3);
    }
    if (!fence) {
      line = line.replace(/<!--[\s\S]*?-->/g, '');
      const start = line.indexOf('<!--');
      if (start >= 0) { comment = true; line = line.slice(0, start); }
    }
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (current) result.get(current).push(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker) { fence = marker[1]; if (current) result.get(current).push(line); continue; }
    const heading = /^#{2,3} (.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      if (!result.has(current)) result.set(current, []);
    } else if (current) result.get(current).push(line);
  }
  return new Map([...result].map(([key, lines]) => [key, lines.join('\n').trim()]));
}

const hasContent = value => Boolean(value?.trim()) && !/^(?:_?No response_?|N\/A|미정|TODO|TBD|-+)$/i.test(value.trim());
const namesOf = labels => (labels ?? []).map(label => typeof label === 'string' ? label : label.name);

export function validateIssue(issue) {
  const errors = [];
  const labels = namesOf(issue.labels);
  const selectedTypes = labels.filter(label => label.startsWith('type:'));
  const type = selectedTypes.length === 1 ? selectedTypes[0].slice(5) : undefined;
  if (!hasType(type)) errors.push('type:bug / type:enhancement / type:task / type:decision 중 하나의 라벨이 필요합니다.');
  const title = typeof issue.title === 'string' ? issue.title : '';
  const titleMatch = /^([A-Za-z]+): ([^\r\n]+)$/.exec(title);
  const titleArea = areas.includes(titleMatch?.[1]) ? titleMatch[1] : undefined;
  if (!titleArea || !titleMatch[2].trim()) errors.push('제목은 Editor / Desktop / Core / CLI / Host / Docs / Product 중 하나로 시작하는 "영역: 구체적인 증상 또는 원하는 결과" 형식이어야 합니다.');
  const sections = sectionsOf(issue.body);
  const bodyArea = sections.get('영역');
  if (bodyArea && !areas.includes(bodyArea)) errors.push('본문의 영역은 정해진 영역 중 하나여야 합니다.');
  if (bodyArea && titleArea && bodyArea !== titleArea) errors.push('제목의 영역과 본문의 영역이 서로 다릅니다.');
  const area = areas.includes(bodyArea) ? bodyArea : titleArea;
  for (const item of hasType(type) ? types[type].fields : []) {
    const value = sections.get(item.label);
    if (item.required && !hasContent(value)) errors.push(`"${item.label}" 항목에 알려진 정보를 적어주세요. 모르는 원인이나 재현 결과를 만들지 않습니다.`);
    else if (item.options && hasContent(value) && !item.options.includes(value)) errors.push(`"${item.label}" 값은 ${item.options.join(' / ')} 중 하나여야 합니다.`);
  }
  const state = type === 'decision' ? sections.get('검토 상태') : undefined;
  const status = state === '향후 검토' ? 'status:deferred' : state === '결정 필요' ? 'status:needs-decision' : undefined;
  return { errors, type: hasType(type) ? type : undefined, area, status };
}

/** Structured CLI input cannot invent extra sections or accidentally omit a required field. */
export function createIssue(input) {
  if (!hasType(input.type)) throw new Error('type must be bug, enhancement, task or decision');
  if (!areas.includes(input.area)) throw new Error(`area must be ${areas.join(', ')}`);
  if (typeof input.summary !== 'string' || !input.summary.trim() || /[\r\n]/.test(input.summary)) throw new Error('summary must be a non-empty single line');
  const definition = types[input.type];
  const fields = input.fields ?? {};
  const known = new Set(definition.fields.map(item => item.id));
  for (const key of Object.keys(fields)) if (!known.has(key)) throw new Error(`Unknown field: ${key}`);
  for (const value of Object.values(fields)) if (typeof value !== 'string') throw new Error('Field values must be strings');
  const body = [`## 영역\n\n${input.area}`, ...definition.fields
    .filter(item => item.required || fields[item.id]?.trim())
    .map(item => `## ${item.label}\n\n${fields[item.id]?.trim() ?? ''}`)].join('\n\n');
  const issue = { title: `${input.area}: ${input.summary.trim()}`, body, labels: [`type:${input.type}`, `area:${input.area.toLowerCase()}`] };
  const result = validateIssue(issue);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (result.status) issue.labels.push(result.status);
  return issue;
}

/** Adjust only policy metadata. Existing semantic labels, assignment and milestones stay owned by people. */
export function metadataChanges(issue, result = validateIssue(issue)) {
  const existing = namesOf(issue.labels);
  const wanted = new Set();
  if (result.area) wanted.add(`area:${result.area.toLowerCase()}`);
  if (result.type === 'decision' && result.status) wanted.add(result.status);
  if (result.errors.length) wanted.add('status:needs-info');
  const managed = name => name.startsWith('area:') || name === 'status:needs-info' ||
    (result.type === 'decision' && ['status:needs-decision', 'status:deferred'].includes(name));
  return { add: [...wanted].filter(name => !existing.includes(name)), remove: existing.filter(name => managed(name) && !wanted.has(name)) };
}
