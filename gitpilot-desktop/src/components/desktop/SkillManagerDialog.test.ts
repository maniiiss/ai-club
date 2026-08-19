import { describe, expect, it } from 'vitest';
import { filterManagedSkills, nextSkillModes } from './SkillManagerDialog';
import type { ManagedSkill } from '@/src/rpc/types';

const skill: ManagedSkill = {
	id: 'frontend-review', name: 'frontend-review', description: '审查前端质量', source: 'personal', filePath: 'C:/skills/frontend-review/SKILL.md', enabled: true, modes: ['code'], disableModelInvocation: false,
};

describe('Skill 设置分区', () => {
	it('模式选择不重复，且不能清空全部模式', () => {
		expect(nextSkillModes(['code'], 'work', true)).toEqual(['code', 'work']);
		expect(nextSkillModes(['code', 'work'], 'work', true)).toEqual(['code', 'work']);
		expect(nextSkillModes(['code'], 'code', false)).toEqual(['code']);
	});

	it('按来源和关键词筛选 Skill', () => {
		expect(filterManagedSkills([skill], 'review', 'all')).toEqual([skill]);
		expect(filterManagedSkills([skill], '审查', 'personal')).toEqual([skill]);
		expect(filterManagedSkills([skill], '', 'builtin')).toEqual([]);
	});
});
