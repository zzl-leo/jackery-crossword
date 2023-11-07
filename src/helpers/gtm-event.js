export const handleCrosswordGTM = (params) => {
        try {
            window.dataLayer.push({ event_parameters: null });
            window.dataLayer.push({
                event: "ga4Event",
                event_name: "Game_share",
                event_parameters: {
                current_page: window.location.href,
                ...params
                }
            })
        } catch (error) {
            console.log(error)
        }
}

export const handleGameGTM = (params) => {
        try {
            window.dataLayer.push({ event_parameters: null });
            window.dataLayer.push({
                event: "ga4Event",
                event_name: "Game",
                event_parameters: {
                current_page: window.location.href,
                ...params
                }
            })
        } catch (error) {
            console.log(error)
        }
}