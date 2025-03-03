export const getPetBucket = (type, tier, level) => {
    type = type.toUpperCase();

    if (level < 100) return `${tier}_${type};1-99`;
    if (type === "GOLDEN_DRAGON") {
        const lower = Math.floor(level / 10) * 10;
        return lower + 10 >= 200 ? `${tier}_${type};200` : `${tier}_${type};${lower}-${lower + 10}`;
    }

    return `${tier}_${type};100`;
};