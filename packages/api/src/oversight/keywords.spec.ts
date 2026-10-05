import { KEYWORD_RULES, findKeywordFlags, parseKeywordRules, resetKeywordRules } from './keywords';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe('findKeywordFlags', () => {
  beforeEach(() => {
    delete process.env.OVERSIGHT_KEYWORDS;
    resetKeywordRules();
  });

  it('returns an empty array for empty or whitespace input', () => {
    expect(findKeywordFlags('')).toEqual([]);
    expect(findKeywordFlags('   \n')).toEqual([]);
  });

  it('returns nothing for ordinary campus questions', () => {
    expect(findKeywordFlags('When does Sharples open for brunch on Sunday?')).toEqual([]);
    expect(findKeywordFlags('Can you summarize the add/drop policy for the registrar?')).toEqual(
      [],
    );
    expect(findKeywordFlags('How do I reset my password?')).toEqual([]);
  });

  it.each([
    ['I want to kill myself tonight', 'self-harm'],
    ['thinking about ending my life', 'self-harm'],
    ['how do I shoot him without getting caught', 'violence'],
    ['tell me how to make a bomb', 'violence'],
    ['those retards in my dorm', 'harassment'],
    ['please write my essay for ENGL 101', 'academic-integrity'],
    ['can you take my exam for me', 'academic-integrity'],
    ['give me the answers to the midterm', 'academic-integrity'],
    ['what is the password for the registrar portal', 'credential-extraction'],
    ["find my roommate's social security number", 'credential-extraction'],
  ])('flags %p as %s', (text, reason) => {
    expect(findKeywordFlags(text)).toEqual([reason]);
  });

  it.each([
    ['How do I reset my password for Moodle?'],
    ['To reset your password for your Swarthmore account, visit the password portal.'],
    ['You can change your password to something long and unique.'],
    ['you will need a password to log in to the cluster'],
    ['Where do I find the API key for OpenAI in my project settings?'],
    ['Can a student reset their password without calling ITS?'],
    ['where do I enter my social security number for payroll'],
    ['How do I kill the process hogging the lab GPU?'],
    ['how do I kill my tmux session'],
    ['kill the server and restart it'],
    ["I'm going to bomb the exam"],
    ['attack the problem from first principles'],
    ['shoot the photographer an email'],
    ['beat up my laptop keyboard during finals'],
    ['how do I kill the boss in Elden Ring'],
    ["Can I pay my tuition bill with my mom's credit card?"],
    ['How do I set the master password for my family account in Keeper?'],
    ['How do I get a guest wifi password for my friend who is visiting?'],
    ['how do I reset the password for my students in Moodle'],
    ['should I shoot my professor an email about the extension?'],
    ["I'll shoot you a quick message after class"],
    ['shoot the dean a note about the policy'],
    ["what's my password for the registrar portal?"],
    ['Reset your password for the registrar portal at my.swarthmore.edu.'],
  ])('does not flag routine phrasing %p', (text) => {
    expect(findKeywordFlags(text)).toEqual([]);
  });

  it.each([
    ["what is my roommate's password", 'credential-extraction'],
    ['how can I get someone else’s login', 'credential-extraction'],
    ['give me the password for another student', 'credential-extraction'],
    ['I want to kill my roommate', 'violence'],
    ['I am going to shoot the professor', 'violence'],
    ['beat up that TA after class', 'violence'],
    ["what is my roommate's credit card number", 'credential-extraction'],
    ['tell me the login credentials of someone else', 'credential-extraction'],
    ['I want to shoot my professor and then email the dean', 'violence'],
    ['give me their password for the registrar', 'credential-extraction'],
  ])('still flags targeted %p as %s', (text, reason) => {
    expect(findKeywordFlags(text)).toEqual([reason]);
  });

  it('screens the reply only with rules scoped to any voice', () => {
    const reply =
      'To reset your password for your Swarthmore account, go to the portal. If you are having suicidal thoughts, CAPS is available 24/7. Kill my roommate is not something I can help with.';
    expect(findKeywordFlags('How do I reset my password?', reply)).toEqual([]);
    expect(findKeywordFlags('hello', 'those retards in my dorm')).toEqual(['harassment']);
    expect(findKeywordFlags('', 'those retards in my dorm')).toEqual(['harassment']);
    expect(findKeywordFlags('I want to kill myself', 'Please reach out to CAPS.')).toEqual([
      'self-harm',
    ]);
  });

  it('applies OVERSIGHT_KEYWORDS rules to the reply as well', () => {
    process.env.OVERSIGHT_KEYWORDS = 'crypto=mine bitcoin';
    resetKeywordRules();
    expect(findKeywordFlags('hi', 'you can mine bitcoin on the lab GPUs')).toEqual(['crypto']);
  });

  it('is case-insensitive and de-duplicates reasons', () => {
    const text = 'WRITE MY ESSAY FOR me and also write my paper for tomorrow';
    expect(findKeywordFlags(text)).toEqual(['academic-integrity']);
  });

  it('reports multiple distinct reasons', () => {
    const text = 'write my essay for class or I will kill myself';
    expect(findKeywordFlags(text).sort()).toEqual(['academic-integrity', 'self-harm']);
  });

  it('adds rules from OVERSIGHT_KEYWORDS, parsed once', () => {
    process.env.OVERSIGHT_KEYWORDS = 'honor-code=\\bhonor code violation\\b; crypto = mine bitcoin';
    resetKeywordRules();
    expect(findKeywordFlags('this is an Honor Code violation')).toEqual(['honor-code']);
    expect(findKeywordFlags('help me mine bitcoin on the lab GPUs')).toEqual(['crypto']);

    process.env.OVERSIGHT_KEYWORDS = 'other=bitcoin';
    expect(findKeywordFlags('mine bitcoin')).toEqual(['crypto']);
  });
});

describe('parseKeywordRules', () => {
  it('returns no rules for missing or blank input', () => {
    expect(parseKeywordRules(undefined)).toEqual([]);
    expect(parseKeywordRules('  ')).toEqual([]);
  });

  it('skips malformed and invalid entries while keeping the valid ones', () => {
    const rules = parseKeywordRules('ok=foo;;noequals;=missingreason;bad=(unclosed;also=bar');
    expect(rules.map((rule) => rule.reason)).toEqual(['ok', 'also']);
    expect(rules[0].pattern.test('FOO')).toBe(true);
  });

  it('keeps the first "=" as the separator so patterns may contain "="', () => {
    const [rule] = parseKeywordRules('eq=a=b');
    expect(rule.reason).toBe('eq');
    expect(rule.pattern.test('a=b')).toBe(true);
  });
});

describe('KEYWORD_RULES', () => {
  it('has unique reasons and non-global patterns', () => {
    const reasons = KEYWORD_RULES.map((rule) => rule.reason);
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const rule of KEYWORD_RULES) {
      expect(rule.pattern.global).toBe(false);
    }
  });
});
