const NICKNAME_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['abigail', 'abby', 'abbie'],
  ['alexander', 'alex', 'xander', 'sasha'],
  ['alexandra', 'alex', 'lexi', 'sasha', 'allie'],
  ['alexis', 'lexi'],
  ['alejandro', 'alex'],
  ['andrew', 'andy', 'drew'],
  ['anthony', 'tony'],
  ['benjamin', 'ben', 'benny'],
  ['caroline', 'carrie'],
  ['catherine', 'katherine', 'kate', 'katie', 'kathy', 'cathy', 'kat', 'cate'],
  ['charles', 'charlie', 'chuck'],
  ['charlotte', 'lottie'],
  ['christina', 'christine', 'chris', 'tina'],
  ['christopher', 'chris', 'topher'],
  ['daniel', 'dan', 'danny'],
  ['david', 'dave', 'davey'],
  ['deborah', 'deb', 'debbie'],
  ['edward', 'ed', 'eddie', 'ted', 'teddy'],
  ['eleanor', 'ellie', 'nora'],
  ['elizabeth', 'liz', 'beth', 'eliza', 'lizzie', 'betsy', 'liza'],
  ['emily', 'em'],
  ['emma', 'em'],
  ['gabriel', 'gabe'],
  ['gabriella', 'gabrielle', 'gabby'],
  ['gregory', 'greg'],
  ['henry', 'hank', 'harry'],
  ['isabel', 'isabella', 'isabelle', 'izzy', 'bella'],
  ['jacob', 'jake'],
  ['james', 'jim', 'jimmy', 'jamie'],
  ['jennifer', 'jen', 'jenny'],
  ['jessica', 'jess'],
  ['john', 'jack', 'johnny'],
  ['jonathan', 'jon'],
  ['joseph', 'joe', 'joey'],
  ['joshua', 'josh'],
  ['julia', 'juliana', 'jules'],
  ['katharine', 'kate', 'katie'],
  ['kimberly', 'kim'],
  ['leonardo', 'leo'],
  ['madeline', 'madeleine', 'maddie'],
  ['margaret', 'maggie', 'meg', 'peggy'],
  ['matthew', 'matt'],
  ['maximilian', 'max'],
  ['maxwell', 'max'],
  ['michael', 'mike', 'mikey'],
  ['nathaniel', 'nathan', 'nate'],
  ['natalie', 'nat'],
  ['nicholas', 'nick'],
  ['nicole', 'nikki'],
  ['oliver', 'ollie'],
  ['olivia', 'liv'],
  ['patricia', 'pat', 'patty', 'trish'],
  ['patrick', 'pat', 'paddy'],
  ['penelope', 'penny'],
  ['peter', 'pete'],
  ['rebecca', 'becca', 'becky'],
  ['richard', 'rich', 'rick', 'ricky'],
  ['robert', 'rob', 'bob', 'bobby', 'robbie'],
  ['samantha', 'sam'],
  ['samuel', 'sam', 'sammy'],
  ['sebastian', 'seb'],
  ['sophia', 'sophie'],
  ['stephanie', 'steph'],
  ['stephen', 'steven', 'steve'],
  ['theodore', 'theo', 'ted', 'teddy'],
  ['thomas', 'tom', 'tommy'],
  ['timothy', 'tim'],
  ['valerie', 'valentina', 'val'],
  ['victoria', 'vicky', 'tori'],
  ['vincent', 'vince'],
  ['william', 'will', 'bill', 'billy', 'liam'],
  ['zachary', 'zach', 'zack'],
];

const VARIANTS: ReadonlyMap<string, ReadonlySet<string>> = NICKNAME_GROUPS.reduce((map, group) => {
  for (const name of group) {
    const existing = map.get(name) ?? new Set<string>();
    for (const variant of group) {
      existing.add(variant);
    }
    map.set(name, existing);
  }
  return map;
}, new Map<string, Set<string>>());

/** All spellings a first name should be findable under, including itself. */
export function nameVariants(name: string): ReadonlySet<string> {
  return VARIANTS.get(name) ?? new Set([name]);
}
