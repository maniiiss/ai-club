package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class WikiSyncCompensationSchedulerTests {

    @Test
    void shouldLetProjectWikiSchedulerRepublishPendingSignals() {
        WikiPageService wikiPageService = mock(WikiPageService.class);
        WikiPageSyncScheduler scheduler = new WikiPageSyncScheduler(wikiPageService);

        scheduler.runPendingSyncTasks();

        verify(wikiPageService).processPendingSyncTasks();
    }

    @Test
    void shouldLetSpaceWikiSchedulerRepublishPendingSignals() {
        WikiSpaceService wikiSpaceService = mock(WikiSpaceService.class);
        WikiSpaceSyncScheduler scheduler = new WikiSpaceSyncScheduler(wikiSpaceService);

        scheduler.runPendingSyncTasks();

        verify(wikiSpaceService).processPendingSyncTasks();
    }
}
