export const idlFactory = ({ IDL }) => {
  const LeaderboardEntry = IDL.Record({
    'principal' : IDL.Principal,
    'rank' : IDL.Nat,
    'totalPoints' : IDL.Nat,
  });
  const Badge = IDL.Record({
    'id' : IDL.Text,
    'name' : IDL.Text,
    'description' : IDL.Text,
    'earnedAt' : IDL.Int,
    'imageUrl' : IDL.Text,
    'criteria' : IDL.Text,
    'rarity' : IDL.Text,
  });
  const UserProfile = IDL.Record({
    'streak' : IDL.Nat,
    'principal' : IDL.Principal,
    'topicScores' : IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat)),
    'badges' : IDL.Vec(Badge),
    'level' : IDL.Nat,
    'totalQuizzes' : IDL.Nat,
    'correctAnswers' : IDL.Nat,
    'totalPoints' : IDL.Nat,
    'lastActive' : IDL.Int,
  });
  return IDL.Service({
    'getAvailableBadges' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text))],
        ['query'],
      ),
    'getBadgeCount' : IDL.Func([], [IDL.Nat], ['query']),
    'getLeaderboard' : IDL.Func([], [IDL.Vec(LeaderboardEntry)], ['query']),
    'getMyBadges' : IDL.Func([], [IDL.Vec(Badge)], ['query']),
    'getMyProfile' : IDL.Func([], [UserProfile], ['query']),
    'getQuizStats' : IDL.Func(
        [],
        [
          IDL.Record({
            'avgScore' : IDL.Nat,
            'totalQuizzes' : IDL.Nat,
            'totalUsers' : IDL.Nat,
            'totalBadgesAwarded' : IDL.Nat,
          }),
        ],
        ['query'],
      ),
    'getTopicLeaderboard' : IDL.Func(
        [IDL.Text],
        [IDL.Vec(LeaderboardEntry)],
        ['query'],
      ),
    'saveQuizResult' : IDL.Func(
        [IDL.Text, IDL.Nat, IDL.Nat, IDL.Nat],
        [UserProfile],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
