'use strict';

const {
  isMentorAutoCriteria,
  MENTOR_AUTO_CRITERIA,
  qualifyingReviewWhere,
  REVIEW_STUB_TEXT,
} = require('../../src/utils/mentorBadgeRules');

describe('mentorBadgeRules', () => {
  test('lists supported automatic mentor criteria', () => {
    expect(isMentorAutoCriteria('mentor_accepted_answers')).toBe(true);
    expect(isMentorAutoCriteria('custom')).toBe(false);
    expect(MENTOR_AUTO_CRITERIA).toContain('mentor_cert_verifications');
  });

  test('qualifying review where excludes rubber-stamp stubs', () => {
    const { Op } = require('sequelize');
    const where = qualifyingReviewWhere('mentor-1');
    expect(where.mentorId).toBe('mentor-1');
    expect(where[Op.not]).toBeTruthy();
    expect(REVIEW_STUB_TEXT).toContain('Approved.');
  });
});
