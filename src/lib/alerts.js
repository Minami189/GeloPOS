import { Platform, Alert } from 'react-native';

export const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
};

export const showConfirm = (title, message, onConfirm, confirmText = 'Confirm') => {
    if (Platform.OS === 'web') {
        const result = window.confirm(`${title}\n\n${message}`);
        if (result) {
            onConfirm();
        }
    } else {
        Alert.alert(
            title,
            message,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: confirmText, style: 'destructive', onPress: onConfirm }
            ]
        );
    }
};
