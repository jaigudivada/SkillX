const state = {
  currentUserId: null,
  posts: [],
  currentBrowseTab: 0,
  selectedPostType: 0,
  authMode: 'user',
  activeCategoryFilter: null,
  adminUIUserMode: false,
  browseSortMode: 'recent',
  reportDraftTarget: null,
  lastOpenedSkillPost: null,
  onboardingStep: 0,
};

const categories = [
  'Programming & Tech', 'Design & Creative', 'Languages & Communication',
  'Academic & Research', 'Soft Skills', 'Music & Arts', 'Other'
];

export { state, categories };
