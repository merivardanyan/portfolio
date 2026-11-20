import { HOUR } from './core.js'

export const SEED_USERS = ['crumbjudge', 'tabs_not_spaces', 'night_owl', 'oatmilk_ok', 'meetingcouldbe', 'sir_reply_all', 'popcorn_pundit', 'cold_brewer', 'umami_max', 'deskplant']

// [category, take, guilty argument, acquit argument]
const TAKES = [
  ['Food', 'Pineapple belongs on pizza.', 'Fruit on a hot pie is a crime of texture.', 'Sweet plus salty is the whole point of ham.'],
  ['Food', 'Cereal is a soup.', 'Soup is savoury and served warm. Case closed.', 'Liquid base, solid bits, eaten with a spoon.'],
  ['Food', 'A hot dog is a sandwich.', 'Nobody has ever ordered "a sandwich" and expected a hot dog.', 'Bread, filling, handheld. The math is the math.'],
  ['Food', 'Breakfast for dinner beats dinner for dinner.', 'Pancakes at 8pm are a cry for help.', 'Eggs are elite at any hour.'],
  ['Food', 'Ketchup on eggs is completely fine.', 'It drowns the eggs. Use hot sauce like an adult.', 'Tomatoes and eggs are a classic pairing worldwide.'],
  ['Food', 'Well-done steak is a valid choice.', 'You paid for flavour and cooked it out.', 'Let people eat what they enjoy.'],
  ['Food', 'Crunchy peanut butter is superior.', 'It tears the bread. Smooth spreads.', 'Texture is the point of food.'],
  ['Food', 'Leftover pizza is better cold.', 'Reheated in a pan is objectively crispier.', 'The cheese sets. It becomes a new dish.'],
  ['Tech', 'Tabs are better than spaces.', 'Every style guide you respect uses spaces.', 'Tabs let everyone pick their own width. Accessibility win.'],
  ['Tech', 'Dark mode is overrated.', 'Light mode with sunlight is unreadable glare.', 'Contrast and eye strain are real for many people.'],
  ['Tech', 'Nobody needs more than 10 browser tabs.', 'My 140 tabs are a living to-do list.', 'Bookmarks exist. Close the tabs.'],
  ['Tech', 'Group chats should have read receipts off by default.', 'Receipts stop the "did you see my message" follow-ups.', 'Nobody owes an instant reply.'],
  ['Tech', 'Most meetings should be a shared doc.', 'Some decisions need a real conversation.', 'A doc is async, searchable and skimmable.'],
  ['Tech', 'Physical keyboards on phones should come back.', 'Glass keyboards plus autocorrect are faster now.', 'Tactile feedback beat everything we have today.'],
  ['Tech', 'Smart fridges are pointless.', 'Seeing inside your fridge from the store is genuinely handy.', 'A fridge that needs updates is a liability.'],
  ['Tech', 'Voice notes are rude.', 'Some things sound kinder than they read.', 'Making me listen to 4 minutes for one fact is rude.'],
  ['Life', 'Socks with sandals are comfortable and correct.', 'It looks like a dare that went wrong.', 'Warm feet, ventilated toes. Peak engineering.'],
  ['Life', 'Making the bed every morning is a waste of time.', 'Two minutes buys a calmer room all day.', 'You are getting back into it in 14 hours.'],
  ['Life', 'Showering at night beats showering in the morning.', 'Morning showers are what actually wake you up.', 'Clean sheets stay clean. Science.'],
  ['Life', 'Being early is the same as being late.', 'Early people never block anyone.', 'Arriving 20 minutes early makes the host panic.'],
  ['Life', 'Birthdays after 30 do not need a party.', 'Any excuse to gather friends is a good one.', 'A nice dinner is plenty.'],
  ['Life', 'Cats are better roommates than most people.', 'Cats knock your coffee off the table on purpose.', 'Quiet, clean, pay no rent but no drama either.'],
  ['Life', 'Gyms should ban phones on the floor.', 'Phones run the playlist and the workout log.', 'Bench hoggers scrolling for ten minutes, though.'],
  ['Life', 'Fitted sheets cannot be folded and should not be.', 'There is a technique. It takes one video.', 'Ball it up. Nobody inspects your closet.'],
  ['Pop Culture', 'The book is not always better than the movie.', 'Books keep the inner monologue. Movies cut it.', 'Some adaptations fix pacing problems the book had.'],
  ['Pop Culture', 'Most movies should be 90 minutes.', 'Epic stories need room to breathe.', 'If it runs past two hours it needed an editor.'],
  ['Pop Culture', 'Spoilers expire after one week.', 'Not everyone can watch on opening weekend.', 'You cannot hold the whole internet hostage.'],
  ['Pop Culture', 'Reality TV is the most honest TV.', 'It is edited harder than any drama.', 'It shows how people actually act under stress.'],
  ['Pop Culture', 'Binge releases ruined TV conversation.', 'Watching at your own pace is freedom.', 'Weekly episodes gave everyone something to talk about.'],
  ['Pop Culture', 'Sequels are usually better than originals.', 'Name ten. You will get stuck at four.', 'Bigger budget, characters already set up.'],
  ['Pop Culture', 'Award shows should be 60 minutes max.', 'Speeches are the only good part.', 'Nobody watches the whole thing live anyway.'],
  ['Pop Culture', 'Lyrics matter more than the beat.', 'You dance to the beat, not the words.', 'Great lyrics are why songs last decades.'],
  ['Work', 'Four-day work weeks should be standard.', 'Some jobs need coverage five days a week.', 'Output matters, not hours in the chair.'],
  ['Work', 'Cameras on in video calls should be optional.', 'Faces build trust on a remote team.', 'Nobody needs to see my kitchen at 8am.'],
  ['Work', 'Reply-all should require a confirmation.', 'Reply-all keeps everyone in the loop.', 'One accidental reply-all costs a hundred people a minute each.'],
  ['Work', 'Open offices are bad for everyone.', 'Easy collaboration beats walls.', 'Headphones on all day is not collaboration.'],
  ['Work', 'Salary ranges should be in every job post.', 'Companies need room to negotiate.', 'It saves everyone hours of interviews.'],
  ['Work', 'Fridays should be meeting-free.', 'Some things cannot wait until Monday.', 'One focus day a week pays for itself.'],
  ['Work', 'Desk lunches are fine.', 'Step away from the screen for 30 minutes.', 'Some people like a quiet lunch with a podcast.'],
  ['Work', 'Emoji in work chat is professional.', 'A thumbs-up can read as passive-aggressive.', 'Tone is hard in text and emoji fix it.'],
]

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic seed data. Times are relative to `now` so the docket always has open, closing and closed cases. */
export function buildSeed(now) {
  const rng = mulberry32(140)
  const users = SEED_USERS.map((username, i) => ({ id: i + 1, username, passwordHash: null, salt: null, createdAt: now - 400 * HOUR }))
  const cases = []
  const args = []
  TAKES.forEach(([category, body, gArg, aArg], i) => {
    const id = i + 1
    const ageHours = Math.round((((i * 17) % 40) * 2.7 + rng() * 6) % 110)
    const total = 20 + Math.floor(rng() * 260)
    const lean = 0.2 + rng() * 0.6
    const guilty = Math.round(total * lean)
    const acquit = total - guilty
    const createdAt = now - ageHours * HOUR - Math.floor(rng() * HOUR)
    const recentVotes = ageHours < 72 ? Math.round(total * (0.15 + rng() * 0.6)) : 0
    cases.push({ id, userId: (i % users.length) + 1, body, category, createdAt, guilty, acquit, recentVotes })
    args.push({ id: args.length + 1, caseId: id, userId: ((i + 3) % users.length) + 1, side: 'guilty', body: gArg, upvotes: Math.floor(rng() * 40), createdAt: createdAt + HOUR })
    args.push({ id: args.length + 1, caseId: id, userId: ((i + 6) % users.length) + 1, side: 'acquit', body: aArg, upvotes: Math.floor(rng() * 40), createdAt: createdAt + 2 * HOUR })
  })
  return { version: 1, users, cases, votes: [], arguments: args, argumentUpvotes: [], session: null }
}
