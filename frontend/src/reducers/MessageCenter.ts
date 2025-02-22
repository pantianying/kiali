import { MessageType, NotificationMessage } from '../types/MessageCenter';
import { MessageCenterState } from '../store/Store';
import { KialiAppAction } from '../actions/KialiAppAction';
import { getType } from 'typesafe-actions';
import { MessageCenterActions } from '../actions/MessageCenterActions';
import { updateState } from '../utils/Reducer';
import { LoginActions } from '../actions/LoginActions';
import _ from 'lodash';

export const INITIAL_MESSAGE_CENTER_STATE: MessageCenterState = {
  nextId: 0,
  groups: [
    {
      id: 'systemErrors',
      title: 'Open issues',
      messages: [],
      showActions: false,
      hideIfEmpty: true
    },
    {
      id: 'default',
      title: 'Notifications',
      messages: [],
      showActions: true,
      hideIfEmpty: false
    }
  ],
  hidden: true,
  expanded: false,
  expandedGroupId: 'default'
};

const createMessage = (
  id: number,
  content: string,
  detail: string,
  type: MessageType,
  count: number,
  showNotification: boolean,
  created: Date,
  showDetail: boolean,
  firstTriggered?: Date
) => {
  return {
    id,
    content,
    detail,
    type,
    count,
    show_notification: showNotification,
    seen: false,
    created: created,
    showDetail: showDetail,
    firstTriggered
  };
};

// Updates several messages with the same payload, useful for marking messages
// returns the updated state
const updateMessage = (state: MessageCenterState, messageIds: number[], updater) => {
  const groups = state.groups.map(group => {
    group = {
      ...group,
      messages: group.messages.map(message => {
        if (messageIds.includes(message.id)) {
          message = updater(message);
        }
        return message;
      })
    };
    return group;
  });
  return updateState(state, { groups });
};

const Messages = (
  state: MessageCenterState = INITIAL_MESSAGE_CENTER_STATE,
  action: KialiAppAction
): MessageCenterState => {
  switch (action.type) {
    case getType(MessageCenterActions.addMessage): {
      const { content, detail, groupId, messageType, showNotification } = action.payload;

      const groups = state.groups.map(group => {
        if (group.id === groupId) {
          const existingMessage = group.messages.find(message => {
            // Note, we don't include detail when determining same-ness, just the main content.  This is to avoid
            // trivial detail differences (like a timestamp).  If changing this approach apply the same change below
            // for message removal.
            return message.content === content;
          });

          // remove the old message from the list
          const filteredArray = _.filter(group.messages, message => {
            return message.content !== content;
          });

          let newMessage: NotificationMessage;
          let count = 1;
          let firstTriggered: Date | undefined = undefined;

          if (existingMessage) {
            // it is in the list already
            firstTriggered = existingMessage.firstTriggered ? existingMessage.firstTriggered : existingMessage.created;

            count += existingMessage.count;
          }

          newMessage = createMessage(
            state.nextId,
            content,
            detail,
            messageType,
            count,
            showNotification,
            new Date(),
            false,
            firstTriggered
          );

          group = { ...group, messages: filteredArray.concat(newMessage) };

          return group;
        }
        return group;
      });
      return updateState(state, { groups: groups, nextId: state.nextId + 1 });
    }

    case getType(MessageCenterActions.removeMessage): {
      const messageId = action.payload.messageId;
      const groups = state.groups.map(group => {
        group = {
          ...group,
          messages: group.messages.filter(message => {
            return !messageId.includes(message.id);
          })
        };
        return group;
      });
      return updateState(state, { groups });
    }

    case getType(MessageCenterActions.toggleMessageDetail): {
      return updateMessage(state, action.payload.messageId, message => ({
        ...message,
        showDetail: !message.showDetail
      }));
    }

    case getType(MessageCenterActions.markAsRead): {
      return updateMessage(state, action.payload.messageId, message => ({
        ...message,
        seen: true,
        show_notification: false
      }));
    }

    case getType(MessageCenterActions.hideNotification): {
      return updateMessage(state, action.payload.messageId, message => ({ ...message, show_notification: false }));
    }

    case getType(MessageCenterActions.showMessageCenter):
      if (state.hidden) {
        return updateState(state, { hidden: false });
      }
      return state;

    case getType(MessageCenterActions.hideMessageCenter):
      if (!state.hidden) {
        return updateState(state, { hidden: true });
      }
      return state;

    case getType(MessageCenterActions.toggleExpandedMessageCenter):
      return updateState(state, { expanded: !state.expanded });

    case getType(MessageCenterActions.toggleGroup): {
      const { groupId } = action.payload;
      if (state.expandedGroupId === groupId) {
        return updateState(state, { expandedGroupId: undefined });
      }
      return updateState(state, { expandedGroupId: groupId });
    }

    case getType(MessageCenterActions.expandGroup): {
      const { groupId } = action.payload;
      return updateState(state, { expandedGroupId: groupId });
    }
    case getType(LoginActions.loginRequest): {
      // Let's clear the message center quen user is loggin-in. This ensures
      // that messages from a past session won't persist because may be obsolete.
      return INITIAL_MESSAGE_CENTER_STATE;
    }
    default:
      return state;
  }
};

export default Messages;
