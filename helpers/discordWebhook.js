export const sendRelayMessage = async (relayMessage) => {
    console.log("Sending relay message:", relayMessage);
    return fetch("https://discord.com/api/webhooks/1345886126283427850/z8WQnV1NTzFH64hsl-JLo3jF6f9BqeROen8xbrDTLqN3-HjJEGKBtvfRLKW0Z-khvrRS", { 
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