import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Iter "mo:base/Iter";
import Text "mo:base/Text";
import Option "mo:base/Option";

actor {
    // NFT Badge Type
    public type Badge = {
        id: Text;
        name: Text;
        description: Text;
        imageUrl: Text;
        criteria: Text;
        rarity: Text; // "common", "rare", "epic", "legendary"
        earnedAt: Int; // Timestamp when earned
    };

    // User profile type for tracking progress with badges
    public type UserProfile = {
        principal: Principal;
        totalQuizzes: Nat;
        correctAnswers: Nat;
        topicScores: [(Text, Nat)]; // (Topic, BestScore)
        streak: Nat; // Consecutive days
        lastActive: Int;
        level: Nat; // User level
        totalPoints: Nat; // Total points earned
        badges: [Badge]; // NFT Badges earned
    };

    // Quiz result type
    public type QuizResult = {
        topic: Text;
        score: Nat;
        correctAnswers: Nat;
        totalQuestions: Nat;
        timestamp: Int;
    };

    // Leaderboard entry type
    public type LeaderboardEntry = {
        principal: Principal;
        totalPoints: Nat;
        rank: Nat;
    };

    // Badge template definitions
    private let badgeTemplates : [(Text, Text, Text, Text, Text)] = [
        ("first_quiz", "First Steps", "Complete your first quiz", "🎯", "common"),
        ("perfect_score", "Perfectionist", "Score 100% on any quiz", "💯", "rare"),
        ("streak_7", "Week Warrior", "Maintain a 7-day learning streak", "🔥", "epic"),
        ("topic_master", "Topic Master", "Achieve 90%+ average in any topic", "🏆", "epic"),
        ("quiz_master", "Quiz Master", "Complete 50 quizzes", "👑", "legendary"),
        ("speed_demon", "Speed Demon", "Complete a quiz in under 60 seconds", "⚡", "rare"),
        ("scholar", "Scholar", "Complete 10 quizzes", "📚", "common"),
        ("perfectionist_streak", "Perfect Streak", "Score 100% on 3 consecutive quizzes", "🌟", "legendary")
    ];

    // Stable storage for user profiles
    private stable var userProfilesEntries : [(Principal, UserProfile)] = [];
    private var userProfiles = HashMap.fromIter<Principal, UserProfile>(
        userProfilesEntries.vals(), 10, Principal.equal, Principal.hash
    );

    // Helper to find topic score
    private func findTopicScore(topic: Text, scores: [(Text, Nat)]) : ?Nat {
        for ((t, s) in scores.vals()) {
            if (t == topic) return ?s;
        };
        null
    };

    // Helper to update topic scores
    private func updateTopicScores(topic: Text, newScore: Nat, currentScores: [(Text, Nat)]) : [(Text, Nat)] {
        let filtered = Array.filter<(Text, Nat)>(currentScores, func((t, _)) : Bool = t != topic);
        Array.append(filtered, [(topic, newScore)])
    };

    // Calculate user level based on total points
    private func calculateLevel(totalPoints: Nat) : Nat {
        if (totalPoints < 100) 1
        else if (totalPoints < 250) 2
        else if (totalPoints < 500) 3
        else if (totalPoints < 1000) 4
        else if (totalPoints < 2000) 5
        else totalPoints / 400 + 1
    };

    // Calculate points based on performance
    private func calculatePoints(score: Nat, streak: Nat) : Nat {
        let basePoints = score; // Base points = percentage score
        let streakBonus = if (streak > 5) 20 else if (streak > 2) 10 else 0;
        basePoints + streakBonus
    };

    // Check if user has a specific badge
    private func hasBadge(profile: UserProfile, badgeId: Text) : Bool {
        Option.isSome(Array.find<Badge>(profile.badges, func(b) = b.id == badgeId))
    };

    // Create a badge from template
    private func createBadge(badgeId: Text, earnedAt: Int) : ?Badge {
        switch (Array.find<(Text, Text, Text, Text, Text)>(badgeTemplates, func((id, _, _, _, _)) = id == badgeId)) {
            case (?(id, name, description, icon, rarity)) {
                ?{
                    id = id;
                    name = name;
                    description = description;
                    imageUrl = icon; // Using emoji as simple image
                    criteria = description;
                    rarity = rarity;
                    earnedAt = earnedAt;
                }
            };
            case null null;
        }
    };

    // Check for new badge achievements
    private func checkAchievements(profile: UserProfile, newScore: Nat) : [Badge] {
        var newBadges : [Badge] = [];
        let now = Time.now();
        
        // First Quiz Badge
        if (profile.totalQuizzes == 1 and not hasBadge(profile, "first_quiz")) {
            switch (createBadge("first_quiz", now)) {
                case (?badge) newBadges := Array.append(newBadges, [badge]);
                case null {};
            };
        };
        
        // Perfect Score Badge
        if (newScore == 100 and not hasBadge(profile, "perfect_score")) {
            switch (createBadge("perfect_score", now)) {
                case (?badge) newBadges := Array.append(newBadges, [badge]);
                case null {};
            };
        };
        
        // 7-Day Streak Badge
        if (profile.streak >= 7 and not hasBadge(profile, "streak_7")) {
            switch (createBadge("streak_7", now)) {
                case (?badge) newBadges := Array.append(newBadges, [badge]);
                case null {};
            };
        };
        
        // Topic Master Badge (90%+ average in any topic)
        let hasTopicMastery = Array.find<(Text, Nat)>(profile.topicScores, func((_, score)) = score >= 90);
        if (hasTopicMastery != null and not hasBadge(profile, "topic_master")) {
            switch (createBadge("topic_master", now)) {
                case (?badge) newBadges := Array.append(newBadges, [badge]);
                case null {};
            };
        };
        
        // Quiz Master Badge (50 quizzes)
        if (profile.totalQuizzes >= 50 and not hasBadge(profile, "quiz_master")) {
            switch (createBadge("quiz_master", now)) {
                case (?badge) newBadges := Array.append(newBadges, [badge]);
                case null {};
            };
        };
        
        // Scholar Badge (10 quizzes)
        if (profile.totalQuizzes >= 10 and not hasBadge(profile, "scholar")) {
            switch (createBadge("scholar", now)) {
                case (?badge) newBadges := Array.append(newBadges, [badge]);
                case null {};
            };
        };
        
        newBadges
    };

    // Save quiz results with caller authentication and badge checking
    public shared(msg) func saveQuizResult(topic: Text, score: Nat, correct: Nat, total: Nat) : async UserProfile {
        let caller = msg.caller;
        let now = Time.now();
        let dayInNs : Int = 86_400_000_000_000; // 1 day in nanoseconds
        
        let profile = switch(userProfiles.get(caller)) {
            case (?p) {
                // Update existing profile
                let newScores = switch(findTopicScore(topic, p.topicScores)) {
                    case (?s) {
                        if (score > s) {
                            // New high score for topic
                            updateTopicScores(topic, score, p.topicScores)
                        } else {
                            // Keep existing score if not better
                            p.topicScores
                        }
                    };
                    case null {
                        // New topic
                        updateTopicScores(topic, score, p.topicScores)
                    };
                };
                
                // Update streak (if last active was within 2 days)
                let newStreak = if (now - p.lastActive <= dayInNs * 2) {
                    p.streak + 1
                } else {
                    1
                };

                let pointsEarned = calculatePoints(score, newStreak);
                let newTotalPoints = p.totalPoints + pointsEarned;

                let updatedProfile = {
                    principal = caller;
                    totalQuizzes = p.totalQuizzes + 1;
                    correctAnswers = p.correctAnswers + correct;
                    topicScores = newScores;
                    streak = newStreak;
                    lastActive = now;
                    level = calculateLevel(newTotalPoints);
                    totalPoints = newTotalPoints;
                    badges = p.badges;
                };

                // Check for new achievements
                let newBadges = checkAchievements(updatedProfile, score);
                { updatedProfile with badges = Array.append(p.badges, newBadges) }
            };
            case null {
                // New user profile
                let pointsEarned = calculatePoints(score, 1);
                let newProfile = {
                    principal = caller;
                    totalQuizzes = 1;
                    correctAnswers = correct;
                    topicScores = [(topic, score)];
                    streak = 1;
                    lastActive = now;
                    level = calculateLevel(pointsEarned);
                    totalPoints = pointsEarned;
                    badges = [];
                };

                // Check for new achievements (first quiz badge)
                let newBadges = checkAchievements(newProfile, score);
                { newProfile with badges = newBadges }
            };
        };
        userProfiles.put(caller, profile);
        profile
    };

    // Get user profile with caller authentication
    public shared query(msg) func getMyProfile() : async UserProfile {
        let caller = msg.caller;
        switch(userProfiles.get(caller)) {
            case (?p) p;
            case null {
                // Return empty profile if new user
                {
                    principal = caller;
                    totalQuizzes = 0;
                    correctAnswers = 0;
                    topicScores = [];
                    streak = 0;
                    lastActive = 0;
                    level = 1;
                    totalPoints = 0;
                    badges = [];
                }
            };
        }
    };

    // Get user's badges
    public shared query(msg) func getMyBadges() : async [Badge] {
        let caller = msg.caller;
        switch(userProfiles.get(caller)) {
            case (?p) p.badges;
            case null [];
        }
    };

    // Get all available badge templates
    public query func getAvailableBadges() : async [(Text, Text, Text, Text, Text)] {
        badgeTemplates
    };

    // Get badge count for user
    public shared query(msg) func getBadgeCount() : async Nat {
        let caller = msg.caller;
        switch(userProfiles.get(caller)) {
            case (?p) p.badges.size();
            case null 0;
        }
    };

    // Get leaderboard (top 10 users by total points)
    public query func getLeaderboard() : async [LeaderboardEntry] {
        let profiles = Iter.toArray(userProfiles.entries());
        let sorted = Array.sort<(Principal, UserProfile)>(profiles, func(a, b) = 
            if (a.1.totalPoints > b.1.totalPoints) #less
            else if (a.1.totalPoints < b.1.totalPoints) #greater
            else #equal
        );
        let top10 = if (profiles.size() > 10) {
            Array.subArray(sorted, 0, 10)
        } else {
            sorted
        };
        
        var result : [LeaderboardEntry] = [];
        var rank = 1;
        for ((principal, profile) in top10.vals()) {
            let entry : LeaderboardEntry = {
                principal = principal;
                totalPoints = profile.totalPoints;
                rank = rank;
            };
            result := Array.append(result, [entry]);
            rank += 1;
        };
        result
    };

    // Get topic leaderboard
    public query func getTopicLeaderboard(topic: Text) : async [LeaderboardEntry] {
        let profiles = Iter.toArray(userProfiles.entries());
        
        var topicProfiles : [(Principal, UserProfile, Nat)] = [];
        for ((principal, profile) in profiles.vals()) {
            switch (findTopicScore(topic, profile.topicScores)) {
                case (?score) {
                    topicProfiles := Array.append(topicProfiles, [(principal, profile, score)]);
                };
                case null {};
            };
        };
        
        let sorted = Array.sort<(Principal, UserProfile, Nat)>(topicProfiles, func(a, b) = 
            if (a.2 > b.2) #less
            else if (a.2 < b.2) #greater
            else #equal
        );
        
        let top10 = if (sorted.size() > 10) {
            Array.subArray<(Principal, UserProfile, Nat)>(sorted, 0, 10)
        } else {
            sorted
        };
        
        var result : [LeaderboardEntry] = [];
        var rank = 1;
        for ((principal, profile, score) in top10.vals()) {
            let entry : LeaderboardEntry = {
                principal = principal;
                totalPoints = score;
                rank = rank;
            };
            result := Array.append(result, [entry]);
            rank += 1;
        };
        result
    };

    // Get quiz statistics
    public query func getQuizStats() : async { totalQuizzes: Nat; totalUsers: Nat; avgScore: Nat; totalBadgesAwarded: Nat } {
        let profiles = Iter.toArray(userProfiles.entries());
        let totalQuizzes = Array.foldLeft<(Principal, UserProfile), Nat>(profiles, 0, func(acc, (_, profile)) {
            acc + profile.totalQuizzes
        });
        let totalCorrect = Array.foldLeft<(Principal, UserProfile), Nat>(profiles, 0, func(acc, (_, profile)) {
            acc + profile.correctAnswers
        });
        let totalBadges = Array.foldLeft<(Principal, UserProfile), Nat>(profiles, 0, func(acc, (_, profile)) {
            acc + profile.badges.size()
        });
        let avgScore = if (totalQuizzes > 0) (totalCorrect * 100) / (totalQuizzes * 5) else 0;

        {
            totalQuizzes = totalQuizzes;
            totalUsers = profiles.size();
            avgScore = avgScore;
            totalBadgesAwarded = totalBadges;
        }
    };

    // Pre-upgrade hook to save stable data
    system func preupgrade() {
        userProfilesEntries := Iter.toArray(userProfiles.entries());
    };

    // Post-upgrade hook to restore data
    system func postupgrade() {
        userProfiles := HashMap.fromIter<Principal, UserProfile>(
            userProfilesEntries.vals(), 10, Principal.equal, Principal.hash
        );
        userProfilesEntries := [];
    };
}
