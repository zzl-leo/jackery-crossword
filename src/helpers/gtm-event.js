export const handleCrosswordGTM = (params) => {
    if(window.dataLayer) {
        window.dataLayer.push({ event_parameters: null });
        window.dataLayer.push({
            event: "ga4Event",
            event_name: "Game_share",
            event_parameters: {
            current_page: window.location.href,
            ...params
            }
        })
    }
}

export const handleGameGTM = (params) => {
    if(window.dataLayer) {
        window.dataLayer.push({ event_parameters: null });
        window.dataLayer.push({
            event: "ga4Event",
            event_name: "Game",
            event_parameters: {
            current_page: window.location.href,
            ...params
            }
        })
    }
}