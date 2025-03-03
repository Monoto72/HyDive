export const sendRelayMessage = async (relayMessage) => {
    console.log("Sending relay message:", relayMessage);
    return fetch("", { 
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [relayMessage] })
    })
    .then((res) => {
        console.log("Response:", res);
        return res;
    })
    .catch((error) => {
        console.error("Error:", error);
        throw error;
    });
};