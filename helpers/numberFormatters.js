export const formatNumber = (num) => {
    if (num >= 1e6) {
        // For numbers 1,000,000 and above, show in millions.
        const formatted = (num / 1e6).toFixed((num / 1e6) < 10 ? 2 : 0);
        return `${parseFloat(formatted)}m`;
    } else if (num >= 1e3) {
        // For numbers 1,000 and above, show in thousands.
        const formatted = (num / 1e3).toFixed((num / 1e3) < 10 ? 2 : 0);
        return `${parseFloat(formatted)}k`;
    }
    return num.toString();
}