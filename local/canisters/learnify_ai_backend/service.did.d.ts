import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Badge {
  'id' : string,
  'name' : string,
  'description' : string,
  'earnedAt' : bigint,
  'imageUrl' : string,
  'criteria' : string,
  'rarity' : string,
}
export interface LeaderboardEntry {
  'principal' : Principal,
  'rank' : bigint,
  'totalPoints' : bigint,
}
export interface UserProfile {
  'streak' : bigint,
  'principal' : Principal,
  'topicScores' : Array<[string, bigint]>,
  'badges' : Array<Badge>,
  'level' : bigint,
  'totalQuizzes' : bigint,
  'correctAnswers' : bigint,
  'totalPoints' : bigint,
  'lastActive' : bigint,
}
export interface _SERVICE {
  'getAvailableBadges' : ActorMethod<
    [],
    Array<[string, string, string, string, string]>
  >,
  'getBadgeCount' : ActorMethod<[], bigint>,
  'getLeaderboard' : ActorMethod<[], Array<LeaderboardEntry>>,
  'getMyBadges' : ActorMethod<[], Array<Badge>>,
  'getMyProfile' : ActorMethod<[], UserProfile>,
  'getQuizStats' : ActorMethod<
    [],
    {
      'avgScore' : bigint,
      'totalQuizzes' : bigint,
      'totalUsers' : bigint,
      'totalBadgesAwarded' : bigint,
    }
  >,
  'getTopicLeaderboard' : ActorMethod<[string], Array<LeaderboardEntry>>,
  'saveQuizResult' : ActorMethod<[string, bigint, bigint, bigint], UserProfile>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
